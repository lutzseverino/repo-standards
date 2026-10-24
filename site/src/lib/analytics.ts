// Cloudflare Web Analytics, on every page. The token is public: it appears in
// each page's source. The beacon is one head tag, in the shape Starlight's
// `head` option takes, so the docs can include the same tag.
export const analyticsBeacon = {
  tag: "script",
  attrs: {
    defer: true,
    src: "https://static.cloudflareinsights.com/beacon.min.js",
    "data-cf-beacon": '{"token": "bb4c3d3b838d4fc1a2b848fc8d34fb72"}',
  },
} as const;
