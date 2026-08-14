const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
};

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'/]/g, (char) => HTML_ENTITIES[char]);
}

export function sanitizeInput(input: string): string {
  return input
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars (keep \n, \r, \t)
    .trim();
}

export function sanitizeName(name: string): string {
  return sanitizeInput(name).replace(/[<>'"`;(){}]/g, '');
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}
