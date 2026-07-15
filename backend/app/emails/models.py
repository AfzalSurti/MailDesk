from datetime import datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class EmailMessage(Base):
    __tablename__ = "emails"
    __table_args__ = (
        UniqueConstraint("account_id", "gmail_uid", name="uq_emails_account_uid"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    account_id = Column(
        UUID(as_uuid=True),
        ForeignKey("gmail_accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    gmail_uid = Column(String(50), nullable=False)
    message_id = Column(String(500), nullable=True)
    subject = Column(String(1000), nullable=False, default="")
    from_address = Column(String(500), nullable=False, default="")
    date_header = Column(String(255), nullable=False, default="")
    received_at = Column(DateTime, nullable=True)
    body = Column(Text, nullable=False, default="")
    body_html = Column(Text, nullable=False, default="")
    body_preview = Column(String(500), nullable=False, default="")
    synced_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    category_name = Column(String(255), nullable=True)
    category_priority = Column(String(20), nullable=True)
    confidence_score = Column(Float, nullable=True)
    is_done = Column(Boolean, nullable=False, default=False)
    done_at = Column(DateTime, nullable=True)
    replied_at = Column(DateTime, nullable=True)
    has_reply = Column(Boolean, nullable=False, default=False)
    reply_subject = Column(String(1000), nullable=True)
    reply_body = Column(Text, nullable=True)
    reply_body_html = Column(Text, nullable=True)
    reply_at = Column(DateTime, nullable=True)
