import config from '../config/agent.js';

const SENSITIVE_PATTERNS = [
  { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP_REDACTED]' },
  { pattern: /password["']?\s*[:=]\s*["'][^"']+["']/gi, replacement: 'password: [REDACTED]' },
  { pattern: /pwd["']?\s*[:=]\s*["'][^"']+["']/gi, replacement: 'pwd: [REDACTED]' },
  { pattern: /token["']?\s*[:=]\s*["'][^"']+["']/gi, replacement: 'token: [REDACTED]' },
  { pattern: /secret["']?\s*[:=]\s*["'][^"']+["']/gi, replacement: 'secret: [REDACTED]' },
  { pattern: /api[_-]?key["']?\s*[:=]\s*["'][^"']+["']/gi, replacement: 'api_key: [REDACTED]' },
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+previous\s+instructions/i,
  /ignore\s+all\s+instructions/i,
  /system\s*:\s*/i,
  /new\s+system\s+prompt/i,
  /you\s+are\s+now\s+/i,
  /override\s+security/i,
  /bypass\s+filter/i,
  /act\s+as\s+(admin|system|root)/i,
  /disable\s+safety/i,
  /forget\s+all/i,
];

export function validateInput(input) {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Input is required' };
  }

  const maxLength = config.security.maxMessageLength;
  if (input.length > maxLength) {
    return { valid: false, error: `Input exceeds maximum length of ${maxLength}` };
  }

  if (input.trim().length === 0) {
    return { valid: false, error: 'Input cannot be empty' };
  }

  const injectionCheck = checkPromptInjection(input);
  if (injectionCheck.detected) {
    return { valid: false, error: 'Potentially harmful input detected' };
  }

  return { valid: true };
}

export function sanitizeOutput(output) {
  if (typeof output !== 'string') {
    return output;
  }

  let sanitized = output;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  return sanitized;
}

export function checkPromptInjection(input) {
  if (typeof input !== 'string') {
    return { detected: false };
  }

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      return { detected: true, pattern: pattern.toString() };
    }
  }

  return { detected: false };
}

export function hasPermission(userId, resource, action) {
  // Basic implementation - can be extended with a real permission system
  const permissions = {
    agent: {
      chat: ['read', 'write'],
      conversations: ['read', 'write', 'delete'],
      knowledge: ['read', 'write', 'delete'],
    },
    viewer: {
      chat: ['read'],
      conversations: ['read'],
      knowledge: ['read'],
    },
  };

  const userPerms = permissions[userId] || permissions.agent;
  const resourcePerms = userPerms[resource] || [];
  return resourcePerms.includes(action);
}
