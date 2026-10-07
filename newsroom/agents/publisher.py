"""Publisher Agent: Validates stories against schema, atomically updates news.json, and handles rollback archives."""

from __future__ import annotations
import os
import json
import logging
import urllib.request
import urllib.error
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional

from newsroom.agents.base import BaseAgent
from newsroom.bus import MessageBus, TOPIC_PUBLISHED
from newsroom.schema import validate_story_dict, build_feed_payload, Story
from newsroom.tools import atomic_write_json

class PublisherAgent(BaseAgent):
    """
    Final station of the newsroom pipeline:
    - Validates against JSON schema
    - Maintains the last 20 snapshot backups
    - Atomically updates data/news.json (Method A) or dispatches to API webhook (Method B)
    - Safe fallback ensures existing good news.json is never corrupted
    """

    def __init__(self, bus: MessageBus, config: Dict[str, Any]) -> None:
        super().__init__("Publisher", bus, config)
        st_cfg = config.get("storage", {})
        pub_cfg = config.get("publisher", {})

        # Resolve paths relative to newsroom directory
        base_dir = Path(__file__).resolve().parent.parent
        raw_output = st_cfg.get("output_file", "../data/news.json")
        raw_history = st_cfg.get("history_dir", "../data/history")

        self.output_file = (base_dir / raw_output).resolve()
        self.history_dir = (base_dir / raw_history).resolve()
        self.max_backups = int(st_cfg.get("max_history_backups", 20))

        self.publish_method = pub_cfg.get("method", "file").lower()
        self.api_endpoint = pub_cfg.get("api_endpoint", "http://localhost:3000/api/news/publish")
        self.api_timeout = int(pub_cfg.get("api_timeout_seconds", 10))

    def publish_story(self, story_data: Dict[str, Any], dry_run: bool = True) -> Dict[str, Any]:
        """
        Validates, inserts into current feed, and commits story.
        Returns publish result receipt.
        """
        # Ensure story has unique ID and published timestamp
        if "id" not in story_data:
            import uuid
            story_data["id"] = f"news_{uuid.uuid4().hex[:12]}"
        if "published_at" not in story_data:
            story_data["published_at"] = datetime.now(timezone.utc).isoformat()

        # 1. Schema Validation
        is_valid, errors = validate_story_dict(story_data)
        if not is_valid:
            self.logger.error(f"Schema validation FAILED for story: {errors}")
            return {
                "success": False,
                "error": f"Schema validation failed: {'; '.join(errors)}",
                "story_id": story_data.get("id")
            }

        if dry_run:
            self.logger.info(f"🧪 [DRY-RUN] Schema verified for story '{story_data.get('headline')}'. Live write suppressed.")
            return {
                "success": True,
                "dry_run": True,
                "story_id": story_data.get("id"),
                "status": story_data.get("status"),
                "headline": story_data.get("headline")
            }

        # 2. Live Publishing Execution
        try:
            # Read existing feed or initialize
            existing_stories = self._load_current_stories()

            # Prepend new story (avoid duplicates by id or slug)
            new_list = [s for s in existing_stories if s.get("id") != story_data["id"] and s.get("slug") != story_data["slug"]]
            new_list.insert(0, story_data)

            feed_payload = build_feed_payload(new_list)

            # Method A: Atomic File Write
            written_path = atomic_write_json(
                file_path=str(self.output_file),
                data=feed_payload,
                history_dir=str(self.history_dir),
                max_backups=self.max_backups
            )

            # Method B: Webhook Dispatch if enabled
            if self.publish_method == "api":
                self._dispatch_api(feed_payload)

            receipt = {
                "success": True,
                "dry_run": False,
                "story_id": story_data["id"],
                "file_path": written_path,
                "status": story_data["status"],
                "headline": story_data["headline"],
                "published_at": story_data["published_at"]
            }

            self.logger.info(f"🎉 Successfully published LIVE story: '{story_data['headline']}' -> {written_path}")
            self.publish_event(TOPIC_PUBLISHED, receipt)
            return receipt

        except Exception as err:
            self.logger.critical(f"Unexpected error publishing story: {err}", exc_info=True)
            return {"success": False, "error": str(err), "story_id": story_data.get("id")}

    def _load_current_stories(self) -> List[Dict[str, Any]]:
        """Safely reads the current news.json stories without risk of corruption."""
        if not self.output_file.exists():
            return []
        try:
            with open(self.output_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("stories", [])
        except Exception as err:
            self.logger.warning(f"Could not parse existing news.json ({err}). Starting new feed.")
            return []

    def _dispatch_api(self, feed_payload: Dict[str, Any]) -> None:
        """Sends feed to API endpoint with bearer token authentication."""
        token = os.getenv("PUBLISH_API_TOKEN", "")
        req_headers = {
            "Content-Type": "application/json",
            "User-Agent": "TitanWarNewsroom-Publisher/1.0"
        }
        if token:
            req_headers["Authorization"] = f"Bearer {token}"

        req = urllib.request.Request(
            self.api_endpoint,
            data=json.dumps(feed_payload).encode("utf-8"),
            headers=req_headers,
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=self.api_timeout) as resp:
            self.logger.info(f"API publish returned status {resp.status}")
