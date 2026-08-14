import { describe, expect, it } from "vitest";
import { hostOf, isValidLink, normalizeUrl, prettyUrl } from "@/lib/url-utils";

// Security guard: a saved link's `url` is rendered as an anchor `href`
// (link-card.tsx). If a `javascript:`/`data:`/`vbscript:`/`file:` URL could
// survive normalize + validate, clicking a card would run script or reach a
// local resource. These must never pass — both directly and after normalizeUrl
// (which prepends https:// to schemeless input). Locks the XSS/href guarantee.
describe("dangerous URL schemes never validate (href XSS guard)", () => {
  const dangerous = [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "blob:https://example.com/uuid",
  ];

  for (const input of dangerous) {
    it(`rejects ${JSON.stringify(input)} directly and after normalizeUrl`, () => {
      expect(isValidLink(input)).toBe(false);
      expect(isValidLink(normalizeUrl(input))).toBe(false);
    });
  }

  it("still accepts ordinary http(s) links", () => {
    expect(isValidLink("https://example.com")).toBe(true);
    expect(isValidLink(normalizeUrl("example.com/path"))).toBe(true);
  });
});

describe("hostOf", () => {
  it("returns the bare hostname", () => {
    expect(hostOf("https://example.com/path?q=1")).toBe("example.com");
  });

  it("strips a leading www.", () => {
    expect(hostOf("https://www.example.com")).toBe("example.com");
  });

  it("keeps subdomains other than www", () => {
    expect(hostOf("https://blog.example.com/post")).toBe("blog.example.com");
    expect(hostOf("https://www2.example.com")).toBe("www2.example.com");
  });

  it("lowercases via the URL parser and ignores the port", () => {
    expect(hostOf("https://Example.COM:8443/x")).toBe("example.com");
  });

  it("returns the raw input when it is not a valid URL", () => {
    expect(hostOf("not a url")).toBe("not a url");
    expect(hostOf("")).toBe("");
  });
});

describe("prettyUrl", () => {
  it("drops the protocol and a lone trailing slash", () => {
    expect(prettyUrl("https://example.com/")).toBe("example.com");
    expect(prettyUrl("https://example.com")).toBe("example.com");
  });

  it("keeps the path and strips a trailing slash from it", () => {
    expect(prettyUrl("https://example.com/foo/bar/")).toBe("example.com/foo/bar");
    expect(prettyUrl("https://example.com/foo/bar")).toBe("example.com/foo/bar");
  });

  it("preserves the query string", () => {
    expect(prettyUrl("https://example.com/search?q=hello&p=2")).toBe("example.com/search?q=hello&p=2");
  });

  it("strips www. from the host", () => {
    expect(prettyUrl("https://www.example.com/x")).toBe("example.com/x");
  });

  it("returns the raw input when it is not a valid URL", () => {
    expect(prettyUrl("¯\\_(ツ)_/¯")).toBe("¯\\_(ツ)_/¯");
  });
});
