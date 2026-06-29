from sqlalchemy import Column, String, DateTime, Text, ARRAY, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
import enum
from app.database import Base


class PriorityEnum(str, enum.Enum):
    high = "high"
    medium = "medium"
    low = "low"


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_categories_user_name"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    priority = Column(
        Enum(PriorityEnum, name="priority_enum", create_type=False),
        nullable=False,
        default=PriorityEnum.low,
    )
    description = Column(Text, nullable=True)
    keywords = Column(ARRAY(String), nullable=True, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)
