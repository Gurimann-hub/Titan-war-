"""Commander Agent: Orchestrates the newsroom pipeline, enforces the approval policy, and manages the global kill switch."""

from __future__ import annotations
import os
import logging
from typing import Dict, List, Any, Optional

from newsroom.agents.base import BaseAgent
from newsroom.bus import MessageBus, TOPIC_APPROVED, TOPIC_KILL_SWITCH

class CommanderAgent(BaseAgent):
    """
    Chief editor and pipeline orchestrator.
    - Applies approval policy:
        * When approval_mode == 'manual': impact >= 8 or status == 'breaking' requires manual approval.
        * When approval_mode == 'auto': publishes automatically.
    - Owns the global kill switch.
    - Decides final publish vs. hold actions.
    """

    def __init__(self, bus: MessageBus, config: Dict[str, Any]) -> None:
        super().__init__("Commander", bus, config)
        self.approval_mode = os.getenv("NEWSROOM_APPROVAL_MODE", config.get("app", {}).get("approval_mode", "manual")).lower()
        self.dry_run = os.getenv("NEWSROOM_DRY_RUN", str(config.get("app", {}).get("dry_run", True))).lower() in ("true", "1", "yes")

        # Initial kill switch state
        cfg_kill = config.get("app", {}).get("kill_switch", False)
        env_kill = os.getenv("NEWSROOM_KILL_SWITCH", "false").lower() in ("true", "1", "yes")
        if cfg_kill or env_kill:
            self.engage_kill_switch("Configured kill switch active upon initialization.")

    def engage_kill_switch(self, reason: str = "Operator invoked emergency stop") -> None:
        """Immediately halts all active pipelines."""
        self.logger.critical(f"🛑 ENGAGING KILL SWITCH: {reason}")
        self.bus.set_kill_switch(True)
        self.publish_event(TOPIC_KILL_SWITCH, {"active": True, "reason": reason})

    def release_kill_switch(self) -> None:
        """Disengages the kill switch."""
        self.logger.info("Releasing kill switch.")
        self.bus.set_kill_switch(False)
        self.publish_event(TOPIC_KILL_SWITCH, {"active": False, "reason": "Operator cleared kill switch"})

    def evaluate_and_approve(
        self,
        draft_story: Dict[str, Any],
        manual_override_approved: bool = False
    ) -> Dict[str, Any]:
        """
        Applies editorial policy to draft story.
        Returns evaluation result dictionary with 'action': 'PUBLISH' | 'HOLD' | 'REJECT'.
        """
        if self.bus.is_kill_switch_active():
            self.logger.error("Publish rejected: Global kill switch is currently ENGAGED.")
            return {"action": "HOLD", "reason": "Kill switch active", "story": draft_story}

        impact = draft_story.get("impact_score", 5)
        status = draft_story.get("status", "confirmed")
        headline = draft_story.get("headline", "")

        is_high_stakes = (impact >= 8) or (status == "breaking")

        if is_high_stakes and self.approval_mode == "manual" and not manual_override_approved:
            self.logger.warning(
                f"⏸️ MANUAL APPROVAL REQUIRED for story [Impact={impact}, Status={status}]: '{headline}'. "
                f"Held pending editorial sign-off."
            )
            return {
                "action": "HOLD",
                "requires_human_approval": True,
                "reason": f"Approval mode is manual; impact={impact} (>=8) or status='{status}'",
                "story": draft_story
            }

        # Story is approved for publishing
        approved_payload = {
            **draft_story,
            "commander_approval": {
                "mode": self.approval_mode,
                "dry_run": self.dry_run,
                "approved": True
            }
        }

        self.logger.info(f"✅ Story APPROVED by Commander: '{headline}' [Mode={self.approval_mode}]")
        self.publish_event(TOPIC_APPROVED, approved_payload)
        return {
            "action": "PUBLISH",
            "requires_human_approval": False,
            "dry_run": self.dry_run,
            "story": approved_payload
        }
