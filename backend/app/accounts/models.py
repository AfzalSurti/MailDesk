from sqlalchemy import Column, String, DateTime, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.database import Base


class GmailAccount(Base):
    __tablename__ = "gmail_accounts"
    __table_args__ = (
        UniqueConstraint("user_id", "email_address", name="uq_gmail_accounts_user_email"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    email_address = Column(String(255), nullable=False)
    app_password = Column(String(500), nullable=False)
    display_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    inbox_digest = Column(Text, nullable=True)
    inbox_digest_updated_at = Column(DateTime, nullable=True)
