import { describe, expect, it } from "vitest";
import { hostOf, prettyUrl } from "@/lib/url-utils";

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
