//! Detect openfortivpn / FortiGate OTP challenge lines (OpenFortiGUI-style heuristics).

/// Return true when a log line (or unterminated prompt fragment) is asking for a 2FA token.
pub fn otp_log_line_requests_token(line: &str, custom_prompt: Option<&str>) -> bool {
    if let Some(raw) = custom_prompt.map(str::trim).filter(|s| !s.is_empty()) {
        if let Ok(re) = regex::RegexBuilder::new(raw)
            .case_insensitive(true)
            .build()
        {
            if re.is_match(line) {
                return true;
            }
        }
        return line.to_ascii_lowercase().contains(&raw.to_ascii_lowercase());
    }
    if regex::Regex::new(r"(?i)Please")
        .map(|r| r.is_match(line))
        .unwrap_or(false)
    {
        return true;
    }
    let patterns: &[&str] = &[
        r"(?i)2factor authentication token:",
        r"(?i)Two-factor authentication",
        r"(?i)one-time password",
        r"(?i)Please enter one-time password",
        r"(?i)Two-factor authentication token\s*:",
        r"(?i)enter (?:the |your )?(?:one[-\s]?time )?(?:password|token|code|pin|passcode)\b",
        r"(?i)second\s+factor|2[-\s]?FA|two[-\s]factor",
        r"(?i)SMS[-\s]?code|Authenticator",
        r"(?i)\b(?:challenge|verification)\s+code\b",
        r"(?i)\btoken\s*[:#>?)]",
        r"(?i)authentication key\s*:",
        r"(?i)verification code",
        r"(?i)soft[-\s]?token|hardware[-\s]?token",
        r"(?i)token code",
        r"(?i)email.*(code|token|otp)|(?:code|token|otp).*email",
    ];
    for p in patterns {
        if let Ok(re) = regex::Regex::new(p) {
            if re.is_match(line) {
                return true;
            }
        }
    }
    let has_otp = regex::Regex::new(r"(?i)\bOTP\b")
        .map(|r| r.is_match(line))
        .unwrap_or(false);
    let has_enter = regex::Regex::new(r"(?i)\b(?:enter|type|input|provide)\b")
        .map(|r| r.is_match(line))
        .unwrap_or(false);
    has_otp && has_enter
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_classic_token_prompt_without_newline() {
        assert!(otp_log_line_requests_token(
            "Two-factor authentication token:",
            None
        ));
    }

    #[test]
    fn detects_please_prompt() {
        assert!(otp_log_line_requests_token(
            "Please enter one-time password:",
            None
        ));
    }

    #[test]
    fn custom_prompt_substring() {
        assert!(otp_log_line_requests_token(
            "INFO: Enter token code from email",
            Some("token code")
        ));
    }

    #[test]
    fn ignores_unrelated_info() {
        assert!(!otp_log_line_requests_token("INFO: Connected to gateway.", None));
    }
}
