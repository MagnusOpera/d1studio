import { describe, expect, it } from 'vitest';
import { escapeHtml } from '../src/html.js';

describe('results webview safety', () => {
  it('escapes all HTML-significant output', () => {
    expect(escapeHtml(`<script data-x="1">'&`)).toBe(
      '&lt;script data-x=&quot;1&quot;&gt;&#39;&amp;'
    );
  });
});
