"""OTP generation, verification and email dispatch backed by Redis + aiosmtplib."""
import json
import logging
import secrets
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib

from redis_client import redis

logger = logging.getLogger(__name__)

OTP_TTL = 900  # 15 minutes in seconds

_SUBJECTS = {
    "login": "Your OnTrail sign-in code",
    "welcome": "Welcome to OnTrail — your sign-in code",
    "reset": "Your OnTrail password reset code",
}


def _build_html(code: str, purpose: str) -> str:
    title = _SUBJECTS.get(purpose, "Your OnTrail verification code")
    if purpose == "welcome":
        action = (
            "Your account has been created. Enter this code to complete sign-in and start your OnTrail journey:"
        )
    elif purpose == "login":
        action = "Use this code to sign in to OnTrail:"
    else:
        action = "Use this code to reset your password:"
    spaced = f"{code[:3]}&thinsp;{code[3:]}"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;min-height:100vh;">
    <tr><td align="center" style="padding:48px 16px;">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom:32px;">
          <img src="https://ontrail.tech/ontrail-logo.png" alt="OnTrail" height="36"
               style="height:36px;" />
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:40px;text-align:center;">

          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;">{title}</h1>
          <p style="margin:0 0 32px;font-size:14px;color:#64748b;">{action}</p>

          <!-- OTP code box -->
          <div style="background:#f0fdf4;border:2px solid #86efac;border-radius:16px;padding:28px 16px;margin-bottom:28px;">
            <p style="margin:0;letter-spacing:.45em;font-size:44px;font-weight:800;font-family:'Courier New',monospace;color:#16a34a;">
              {spaced}
            </p>
          </div>

          <!-- Expiry -->
          <p style="margin:0 0 8px;font-size:13px;color:#64748b;">
            This code expires in <strong style="color:#0f172a;">15&nbsp;minutes</strong>.
          </p>
          <p style="margin:0;font-size:12px;color:#94a3b8;">
            If you didn't request this, you can safely ignore this email.
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding-top:24px;">
          <p style="margin:0;font-size:11px;color:#94a3b8;">
            OnTrail &mdash; Web3 SocialFi for Explorers<br />
            <a href="https://ontrail.tech" style="color:#16a34a;text-decoration:none;">ontrail.tech</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


class OTPService:
    """Generate and verify 6-digit one-time passwords stored in Redis, emailed via SMTP."""

    async def generate_otp(
        self, email: str, purpose: str = "login", email_purpose: str | None = None
    ) -> str:
        """Generate a 6-digit OTP, store in Redis (with purpose for verification), and send email.

        email_purpose overrides the purpose used for the email content only — useful for sending a
        welcome email to new users while keeping the Redis purpose as 'login' for verification.
        """
        key = f"otp:{email}"
        code = f"{secrets.randbelow(1_000_000):06d}"
        await redis.delete(key)
        await redis.set(key, json.dumps({"code": code, "purpose": purpose}), ex=OTP_TTL)
        await self._send_email(email, code, email_purpose or purpose)
        return code

    async def verify_otp(self, email: str, code: str, purpose: str = "login") -> bool:
        """Verify the OTP code and purpose. Deletes on success (single-use)."""
        key = f"otp:{email}"
        raw = await redis.get(key)
        if raw is None:
            return False
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return False
        if data.get("code") == code and data.get("purpose") == purpose:
            await redis.delete(key)
            return True
        return False

    async def _send_email(self, to_email: str, code: str, purpose: str) -> None:
        """Dispatch the OTP email. On failure, logs and continues (OTP is still valid)."""
        # Import here to avoid circular import at module load time
        from config import get_settings
        s = get_settings()

        if not s.smtp_host or not s.smtp_user or not s.smtp_password:
            logger.warning("SMTP not configured — skipping OTP email to %s", to_email)
            return

        subject = _SUBJECTS.get(purpose, "Your OnTrail verification code")
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"OnTrail <{s.smtp_from}>"
        msg["To"] = to_email
        msg.attach(MIMEText(_build_html(code, purpose), "html", "utf-8"))

        try:
            await aiosmtplib.send(
                msg,
                hostname=s.smtp_host,
                port=s.smtp_port,
                username=s.smtp_user,
                password=s.smtp_password,
                start_tls=True,
            )
            logger.info("OTP email sent to %s (purpose=%s)", to_email, purpose)
        except Exception as exc:
            logger.error("Failed to send OTP email to %s: %s", to_email, exc)


otp_service = OTPService()
