from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime
from app.database import Base

class GmailAccount(Base):
    __tablename__ = "gmail_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email_address = Column(String(255), unique=True, nullable=False)
    app_password = Column(String(500), nullable=False)
    display_name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)