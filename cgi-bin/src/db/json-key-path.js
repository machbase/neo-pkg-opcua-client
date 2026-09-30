'use strict';

// Same bracket paths as neo-web PR #737. Segments arrive separately so a literal
// dot or bracket in an OPC UA node name cannot become a different nested key.
function jsonKeySqlPath(segments) {
  if (!Array.isArray(segments) || segments.length === 0) throw new Error('JSON key is required');
  const path = segments.map(segment => {
    if (typeof segment !== 'string' || !segment || segment.includes('\0') ||
        (segment.includes("'") && segment.includes('"') && (segment.includes(']') || /^["']/.test(segment)))) {
      throw new Error('This JSON key cannot be queried');
    }
    const needsQuoting = segment.trim() !== segment || segment.startsWith('"') || /[\[\]\\']/.test(segment);
    if (!needsQuoting) return `[${segment}]`;
    if (segment.includes("'") && !segment.includes('"')) return `["${segment}"]`;
    if (segment.includes("'") && segment.includes('"') && !segment.includes(']') && !/^["']/.test(segment)) return `[${segment}]`;
    return `['${segment.replace(/'/g, "''")}']`;
  }).join('');
  return ('$' + path).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

module.exports = { jsonKeySqlPath };
