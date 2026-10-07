"""Base agent class providing message bus registration and standard logging."""

from __future__ import annotations
import logging
from typing import Dict, Any, Optional
from newsroom.bus import MessageBus, EventMessage

class BaseAgent:
    """Abstract base agent providing standard identity, configuration, and bus connectivity."""

    def __init__(self, name: str, bus: MessageBus, config: Dict[str, Any]) -> None:
        self.name = name
        self.bus = bus
        self.config = config
        self.logger = logging.getLogger(f"newsroom.agent.{name.lower()}")

    def publish_event(self, topic: str, payload: Dict[str, Any], correlation_id: str = "") -> EventMessage:
        """Publishes an event to the bus stamped with this agent's identity."""
        self.logger.debug(f"Publishing event to {topic} (correlation_id={correlation_id})")
        return self.bus.publish(topic, payload, sender=self.name, correlation_id=correlation_id)
