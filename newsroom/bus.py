"""In-memory event message bus providing decoupled communication between newsroom agents."""

from __future__ import annotations
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Callable, Dict, List, Any, Optional

logger = logging.getLogger("newsroom.bus")

# Predefined Bus Topics
TOPIC_RAW_CANDIDATE = "newsroom.tracker.candidate"
TOPIC_MARKET_SHIFT = "newsroom.tracker.shift"
TOPIC_VERIFIED = "newsroom.verifier.verified"
TOPIC_REJECTED = "newsroom.verifier.rejected"
TOPIC_ANALYZED = "newsroom.predictor.analyzed"
TOPIC_DRAFTED = "newsroom.writer.drafted"
TOPIC_APPROVED = "newsroom.commander.approved"
TOPIC_PUBLISHED = "newsroom.publisher.published"
TOPIC_KILL_SWITCH = "newsroom.commander.kill_switch"

@dataclass
class EventMessage:
    topic: str
    payload: Dict[str, Any]
    sender: str
    correlation_id: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class MessageBus:
    """Thread-safe, decoupled message bus for agent event pub/sub."""

    def __init__(self) -> None:
        self._subscribers: Dict[str, List[Callable[[EventMessage], None]]] = {}
        self._history: List[EventMessage] = []
        self._kill_switch_active: bool = False

    def subscribe(self, topic: str, handler: Callable[[EventMessage], None]) -> None:
        """Register a handler callback for a specific topic."""
        if topic not in self._subscribers:
            self._subscribers[topic] = []
        self._subscribers[topic].append(handler)
        logger.debug(f"Subscribed handler {getattr(handler, '__name__', 'anon')} to {topic}")

    def publish(self, topic: str, payload: Dict[str, Any], sender: str, correlation_id: str = "") -> EventMessage:
        """Publishes an event message to all topic subscribers."""
        if self._kill_switch_active and topic != TOPIC_KILL_SWITCH:
            logger.warning(f"Kill switch active! Suppressing event {topic} from {sender}")
            return EventMessage(topic=topic, payload=payload, sender=sender, correlation_id=correlation_id)

        msg = EventMessage(topic=topic, payload=payload, sender=sender, correlation_id=correlation_id)
        self._history.append(msg)

        handlers = self._subscribers.get(topic, [])
        for handler in handlers:
            try:
                handler(msg)
            except Exception as err:
                logger.error(f"Error in handler {getattr(handler, '__name__', 'anon')} for topic {topic}: {err}", exc_info=True)

        return msg

    def set_kill_switch(self, active: bool) -> None:
        """Engage or disengage the global kill switch."""
        self._kill_switch_active = active
        if active:
            logger.critical("🚨 GLOBAL KILL SWITCH ENGAGED! All pipelines halted.")
        else:
            logger.info("Global kill switch released.")

    def is_kill_switch_active(self) -> bool:
        return self._kill_switch_active

    def get_history(self) -> List[EventMessage]:
        return list(self._history)

    def clear(self) -> None:
        """Clears subscribers and audit log (useful for test resets)."""
        self._subscribers.clear()
        self._history.clear()
        self._kill_switch_active = False
