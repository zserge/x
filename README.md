# X!

A tiny [htmx](https://htmx.org/) clone. Nearly all of htmx's core plus an event-driven plugin system.

See also [tiny React](https://github.com/zserge/o) and [tiny VueJS](https://github.com/zserge/q) in less than 1KB each.

## Features

**Core** — `x-get` `x-post` `x-put` `x-patch` `x-delete` `x-target` `x-swap` `x-trigger`, attribute inheritance (`closest`), extended selectors (`closest`/`find`/`next`/`previous`/`this`/`document`/`body`/`window`), trigger modifiers (`once` `changed` `delay:ms` `load`), response headers (`HX-Trigger` `HX-Redirect` `HX-Refresh` `HX-Retarget` `HX-Reswap`), 8 swap modes (`innerHTML` `outerHTML` `beforebegin` `afterbegin` `beforeend` `afterend` `delete` `none`), auto-binding.

**Plugins** — `boost` (link/form interception), `confirm`, `disable`, `headers`, `history` (push/replace), `include`, `indicator`, `oob` (out-of-band swaps), `select` (CSS fragment), `sse` (Server-Sent Events), `sync` (abort/drop/queue), `validate`, `vals` (JSON values), `ws` (WebSocket).

## Usage

```html
<script src="x.js"></script>
<!-- or the bundle with all plugins: -->
<script src="dist/x.js"></script>

<button x-get="/hello" x-target="#out">Click</button>
<div id="out"></div> <!-- will be replaced with /hello response -->
```

## Example — TodoMVC

A full TodoMVC app with zero hand-written JS (Go server + x.js):

```sh
go run examples/todomvc/main.go
# http://localhost:8080
```

Uses `x-boost`, `x-target` inheritance, `x-push-url`, `oob` swaps, and multi-event triggers, all declarative.

## API

Plugins have access to a few internal functions: `send` to emit a HTTP request, `swap` to replace the content of a target element with a reponse HTML, `scan` to re-bind all attributes.

```js
window.x.send(el, method, url)  // fire a request
window.x.swap(mode, target, html)  // swap HTML into DOM
window.x.scan(root)  // re-bind x-* attributes
```

Events: `x:beforeSend` `x:afterSend` `x:beforeSwap` `x:afterSwap` `x:aborted` `x:scan` to let plugins control the flow of requests and responses, cancel them, enrich, intercept.

## Build

```sh
npm run build   # bundles plugins → dist/x.js + dist/x.min.js
npm test        # run Jest tests
```

## License

MIT
