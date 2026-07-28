const fs = require("fs");
const path = require("path");

const load = (filename) => {
  const filepath = path.join(__dirname, "..", filename);
  eval(fs.readFileSync(filepath, "utf8"));
};

beforeAll(() => {
  window.__x_safe = true;
  load("x.js");
  load("plugins/confirm.js");
  load("plugins/indicator.js");
  load("plugins/history.js");
  load("plugins/boost.js");
  load("plugins/disable.js");
  load("plugins/headers.js");
  load("plugins/include.js");
  load("plugins/select.js");
  load("plugins/sync.js");
  load("plugins/validate.js");
  load("plugins/vals.js");
  load("plugins/oob.js");
});

if (!globalThis.Response) {
  globalThis.Response = class {
    constructor(body, opts = {}) {
      this._body = body || "";
      this.status = opts.status || 200;
      this.headers = {
        _map: new Map(Object.entries(opts.headers || {})),
        get(k) {
          return this._map.get(k) || null;
        },
      };
      this.ok = this.status >= 200 && this.status < 300;
    }
    text() {
      return Promise.resolve(this._body);
    }
    json() {
      return Promise.resolve(JSON.parse(this._body));
    }
  };
}

let routes = {};

beforeEach(() => {
  routes = {};
  window.fetch = (url, opts = {}) => {
    const key = (opts.method || "GET") + " " + url;
    const r = routes[key] || routes["*"] || {};
    return Promise.resolve(
      new Response(r.body || "", {
        status: r.status || 200,
        headers: r.headers || {},
      }),
    );
  };
});

const fixture = (html) => {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.appendChild(div);
  window.x.scan(div);
  return {
    $: (sel) => div.querySelector(sel),
    click: (sel) => div.querySelector(sel).click(),
    remove: () => div.remove(),
  };
};

const route = (key, val) => {
  routes[key] = typeof val === "string" ? { body: val } : val;
};

const whenSwapped = (targetId) => {
  return new Promise((resolve) => {
    const h = (e) => {
      if (e.detail.target?.id !== targetId) return;
      document.body.removeEventListener("x:afterSwap", h);
      resolve(e);
    };
    document.body.addEventListener("x:afterSwap", h);
  });
};

describe("public API — window.x", () => {
  test("window.x.send exists", () =>
    expect(typeof window.x.send).toBe("function"));
  test("window.x.swap exists", () =>
    expect(typeof window.x.swap).toBe("function"));
  test("window.x.scan exists", () =>
    expect(typeof window.x.scan).toBe("function"));
});

describe("core — scan & send", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("x-get click → fetch → swap", async () => {
    fix = fixture(
      '<button id="btn" x-get="/data" x-target="#t1">load</button>' +
        '<div id="t1">before</div>',
    );
    route("GET /data", "after");

    const p = whenSwapped("t1");
    fix.click("#btn");
    await p;
    expect(fix.$("#t1").textContent.trim()).toBe("after");
  });

  test("x-post form serializes FormData", async () => {
    fix = fixture(
      '<div id="t2">-</div>' +
        '<form x-post="/submit" x-target="#t2">' +
        '<input name="name" value="test">' +
        '<button type="submit">go</button></form>',
    );
    route("POST /submit", "ok");

    const p = whenSwapped("t2");
    fix.click("button");
    await p;
    expect(fix.$("#t2").textContent.trim()).toBe("ok");
  });

  test('x-trigger="load" fires immediately after scan', async () => {
    fix = fixture('<div id="t3">-</div>');
    const el = document.createElement("div");
    el.setAttribute("x-get", "/loaddata");
    el.setAttribute("x-target", "#t3");
    el.setAttribute("x-trigger", "load");
    fix.$("#t3").parentElement.appendChild(el);
    route("GET /loaddata", "loaded");

    const p = whenSwapped("t3");
    window.x.scan(el);
    await p;
    expect(fix.$("#t3").textContent.trim()).toBe("loaded");
  });

  test('x-trigger="click once" fires only once', async () => {
    fix = fixture(
      '<div id="t3b">0</div>' +
        '<button id="b-once" x-get="/once" x-target="#t3b" x-trigger="click once">go</button>',
    );
    route("GET /once", "1");

    const p1 = whenSwapped("t3b");
    fix.click("#b-once");
    await p1;
    expect(fix.$("#t3b").textContent.trim()).toBe("1");

    route("GET /once", "2");
    fix.click("#b-once");
    await new Promise((r) => setTimeout(r, 50));
    expect(fix.$("#t3b").textContent.trim()).toBe("1");
  });
});

describe("core — event pipeline", () => {
  let fix,
    listeners = [];

  const on = (evt, fn) => {
    document.body.addEventListener(evt, fn);
    listeners.push({ evt, fn });
  };
  afterEach(() => {
    listeners.forEach(({ evt, fn }) =>
      document.body.removeEventListener(evt, fn),
    );
    listeners.length = 0;
    if (fix) fix.remove();
  });

  test("x:beforeSend cancelable prevents fetch", async () => {
    fix = fixture(
      '<div id="t4">-</div>' +
        '<button id="btn-t4" x-get="/no" x-target="#t4">go</button>',
    );
    on("x:beforeSend", (e) => {
      if (e.detail.url === "/no") e.preventDefault();
    });
    route("GET /no", "nope");

    fix.click("#btn-t4");
    await new Promise((r) => setTimeout(r, 50));
    expect(fix.$("#t4").textContent.trim()).toBe("-");
  });

  test("x:beforeSwap cancelable prevents DOM update", async () => {
    fix = fixture(
      '<div id="t5">before</div>' +
        '<button id="btn-t5" x-get="/blocked" x-target="#t5">go</button>',
    );
    on("x:beforeSwap", (e) => {
      if (e.detail.url === "/blocked") e.preventDefault();
    });
    route("GET /blocked", "after");

    fix.click("#btn-t5");
    await new Promise((r) => setTimeout(r, 50));
    expect(fix.$("#t5").textContent.trim()).toBe("before");
  });

  test("events fire in correct order", async () => {
    fix = fixture(
      '<div id="t6">-</div>' +
        '<button id="btn-t6" x-get="/order" x-target="#t6">go</button>',
    );
    route("GET /order", "ok");
    const order = [];
    on("x:beforeSend", () => order.push("beforeSend"));
    on("x:afterSend", () => order.push("afterSend"));
    on("x:beforeSwap", () => order.push("beforeSwap"));

    const p = whenSwapped("t6");
    fix.click("#btn-t6");
    await p;
    order.push("afterSwap");
    expect(order).toEqual([
      "beforeSend",
      "afterSend",
      "beforeSwap",
      "afterSwap",
    ]);
  });
});

describe("core — response headers", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("HX-Trigger string → custom event", async () => {
    fix = fixture(
      '<div id="t7">-</div>' +
        '<button id="btn-t7" x-get="/trig" x-target="#t7">go</button>',
    );
    route("GET /trig", { body: "ok", headers: { "HX-Trigger": "my:event" } });

    const p = new Promise((resolve) => {
      document.body.addEventListener("my:event", resolve, { once: true });
    });
    fix.click("#btn-t7");
    await p;
  });

  test("HX-Trigger JSON → event with detail", async () => {
    fix = fixture(
      '<div id="t8">-</div>' +
        '<button id="btn-t8" x-get="/json" x-target="#t8">go</button>',
    );
    route("GET /json", {
      body: "ok",
      headers: { "HX-Trigger": '{"ev":{"x":99}}' },
    });

    const p = new Promise((resolve) => {
      document.body.addEventListener("ev", resolve, { once: true });
    });
    fix.click("#btn-t8");
    const e = await p;
    expect(e.detail.x).toBe(99);
  });

  test("HX-Retarget overrides x-target", async () => {
    fix = fixture(
      '<div id="orig">orig</div><div id="alt">alt</div>' +
        '<button id="btn-t9" x-get="/ret" x-target="#orig">go</button>',
    );
    route("GET /ret", {
      body: "retargeted",
      headers: { "HX-Retarget": "#alt" },
    });

    const p = whenSwapped("alt");
    fix.click("#btn-t9");
    await p;
    expect(fix.$("#alt").textContent.trim()).toBe("retargeted");
    expect(fix.$("#orig").textContent.trim()).toBe("orig");
  });
});

describe("plugins — boost.js", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("click on <a> inside [x-boost] → swap", async () => {
    fix = fixture(
      '<div x-boost x-target="#b1">' +
        '<a id="link-b1" href="/boosted">Boost me</a></div>' +
        '<div id="b1">-</div>',
    );
    route("GET /boosted", "boosted!");

    const p = whenSwapped("b1");
    fix.click("#link-b1");
    await p;
    expect(fix.$("#b1").textContent.trim()).toBe("boosted!");
  });

  test("#hash links skipped", async () => {
    fix = fixture(
      '<div x-boost x-target="#b2">' +
        '<a id="link-b2" href="#section">Scroll</a></div>' +
        '<div id="b2">-</div>',
    );
    route("GET #section", "nope");
    fix.click("#link-b2");
    await new Promise((r) => setTimeout(r, 30));
    expect(fix.$("#b2").textContent.trim()).toBe("-");
  });
});

describe("plugins — indicator.js", () => {
  let fix,
    listeners = [];
  const on = (evt, fn) => {
    document.body.addEventListener(evt, fn);
    listeners.push({ evt, fn });
  };
  afterEach(() => {
    listeners.forEach(({ evt, fn }) =>
      document.body.removeEventListener(evt, fn),
    );
    listeners.length = 0;
    if (fix) fix.remove();
  });

  test("spinner shown during request, hidden after swap", async () => {
    fix = fixture(
      '<div id="spin" style="display:none">spinner</div>' +
        '<div id="t9">-</div>' +
        '<button id="btn-ind" x-get="/spin" x-target="#t9" x-indicator="#spin">go</button>',
    );
    route("GET /spin", "ok");

    let shown = false;
    on("x:beforeSend", () => {
      shown = fix.$("#spin").style.display !== "none";
    });

    const p = whenSwapped("t9");
    fix.click("#btn-ind");
    await p;
    expect(shown).toBe(true);
    expect(fix.$("#spin").style.display).toBe("none");
    expect(fix.$("#btn-ind").classList.contains("htmx-request")).toBe(false);
  });
});

describe("plugins — confirm.js", () => {
  let fix, _confirm;
  beforeEach(() => {
    _confirm = window.confirm;
  });
  afterEach(() => {
    window.confirm = _confirm;
    if (fix) fix.remove();
  });

  test("confirm=true allows, confirm=false cancels", async () => {
    fix = fixture(
      '<div id="c1">-</div>' +
        '<button id="b-yes" x-get="/ok" x-target="#c1" x-confirm="Sure?">ok</button>' +
        '<button id="b-no"  x-get="/cancel" x-target="#c1" x-confirm="Sure?">no</button>',
    );
    route("GET /ok", "confirmed");
    route("GET /cancel", "nope");

    window.confirm = () => true;
    const p = whenSwapped("c1");
    fix.click("#b-yes");
    await p;
    expect(fix.$("#c1").textContent.trim()).toBe("confirmed");

    window.confirm = () => false;
    fix.$("#b-no").click();
    await new Promise((r) => setTimeout(r, 50));
    expect(fix.$("#c1").textContent.trim()).toBe("confirmed");
  });
});

describe("plugins — history.js", () => {
  let fix, _push, _replace;
  beforeEach(() => {
    _push = history.pushState;
    _replace = history.replaceState;
    history._pushed = null;
    history._replaced = null;
    history.pushState = (s, t, u) => {
      history._pushed = u;
    };
    history.replaceState = (s, t, u) => {
      history._replaced = u;
    };
  });
  afterEach(() => {
    history.pushState = _push;
    history.replaceState = _replace;
    if (fix) fix.remove();
  });

  test("x-push-url attribute → pushState", async () => {
    fix = fixture(
      '<div id="h1">-</div>' +
        '<button id="btn-h1" x-get="/p2" x-target="#h1" x-push-url="/p2">go</button>',
    );
    route("GET /p2", "ok");
    const p = whenSwapped("h1");
    fix.click("#btn-h1");
    await p;
    expect(history._pushed).toBe("/p2");
  });

  test('x-push-url="true" pushes request URL', async () => {
    fix = fixture(
      '<div id="h2">-</div>' +
        '<button id="btn-h2" x-get="/auto" x-target="#h2" x-push-url="true">go</button>',
    );
    route("GET /auto", "ok");
    const p = whenSwapped("h2");
    fix.click("#btn-h2");
    await p;
    expect(history._pushed).toBe("/auto");
  });

  test("HX-Push-Url header overrides attribute", async () => {
    fix = fixture(
      '<div id="h3">-</div>' +
        '<button id="btn-h3" x-get="/hdr" x-target="#h3" x-push-url="/attr">go</button>',
    );
    route("GET /hdr", { body: "ok", headers: { "HX-Push-Url": "/from-hdr" } });
    const p = whenSwapped("h3");
    fix.click("#btn-h3");
    await p;
    expect(history._pushed).toBe("/from-hdr");
  });
});

describe("scan(root) must check root.matches()", () => {
  let els = [];
  afterEach(() => {
    els.forEach((e) => e.remove());
    els = [];
  });

  test('scanning an element that itself has x-get + x-trigger="load"', async () => {
    const btn = document.createElement("button");
    btn.setAttribute("x-get", "/standalone");
    btn.setAttribute("x-target", "#bug1-out");
    btn.setAttribute("x-trigger", "load");

    const out = document.createElement("div");
    out.id = "bug1-out";
    out.textContent = "before";

    document.body.appendChild(btn);
    document.body.appendChild(out);
    els.push(btn, out);
    route("GET /standalone", "after");

    const p = whenSwapped("bug1-out");
    window.x.scan(btn);
    await p;

    expect(out.textContent.trim()).toBe("after");
  });

  test('x-trigger="load" on the root of a swapped fragment', async () => {
    const fragment = document.createElement("div");
    fragment.setAttribute("x-get", "/fragment");
    fragment.setAttribute("x-target", "#bug1-out2");
    fragment.setAttribute("x-trigger", "load");

    const out = document.createElement("div");
    out.id = "bug1-out2";
    out.textContent = "before";

    document.body.appendChild(fragment);
    document.body.appendChild(out);
    els.push(fragment, out);
    route("GET /fragment", "loaded");

    const p = whenSwapped("bug1-out2");
    window.x.scan(fragment);
    await p;

    expect(out.textContent.trim()).toBe("loaded");
  });
});

describe("x-target resolution", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test('x-target="this" swaps the triggering element itself', async () => {
    fix = fixture(
      '<button id="btn-this" x-get="/self" x-target="this">go</button>',
    );
    route("GET /self", "replaced");

    const p = whenSwapped("btn-this");
    fix.click("#btn-this");
    await p;
    expect(fix.$("#btn-this").textContent.trim()).toBe("replaced");
  });

  test('x-target="next" swaps the next sibling', async () => {
    fix = fixture(
      '<button id="btn-next" x-get="/n" x-target="next">go</button>' +
        '<div id="tn">before</div>',
    );
    route("GET /n", "after");

    const p = whenSwapped("tn");
    fix.click("#btn-next");
    await p;
    expect(fix.$("#tn").textContent.trim()).toBe("after");
  });

  test('x-target="previous" swaps the previous sibling', async () => {
    fix = fixture(
      '<div id="tp">before</div>' +
        '<button id="btn-prev" x-get="/p" x-target="previous">go</button>',
    );
    route("GET /p", "after");

    const p = whenSwapped("tp");
    fix.click("#btn-prev");
    await p;
    expect(fix.$("#tp").textContent.trim()).toBe("after");
  });

  test('x-target="closest .card" swaps the nearest ancestor match', async () => {
    fix = fixture(
      '<div class="card" id="card1">' +
        '<button id="btn-closest" x-get="/c" x-target="closest .card">go</button>' +
        "</div>",
    );
    route("GET /c", "closest-swapped");

    const btn = fix.$("#btn-closest");
    const p = new Promise((resolve) =>
      btn.addEventListener("x:afterSwap", resolve, { once: true }),
    );
    btn.click();
    await p;
    expect(fix.$("#card1").textContent.trim()).toBe("closest-swapped");
  });

  test('x-target="find span" swaps a descendant of the triggering element', async () => {
    fix = fixture(
      '<button id="btn-find" x-get="/f" x-target="find span">go' +
        '<span id="inner">before</span></button>',
    );
    route("GET /f", "found");

    const p = whenSwapped("inner");
    fix.click("#btn-find");
    await p;
    expect(fix.$("#inner").textContent.trim()).toBe("found");
  });
});

describe("afterSwap must still bubble when target is an ancestor", () => {
  test("indicator is cleared even when x-target is an ancestor of the trigger", async () => {
    const fix = fixture(
      '<div id="spin-a" style="display:none">spinner</div>' +
        '<div class="card" id="card-a">' +
        '<button id="btn-a" x-get="/anc" x-target="closest .card" x-indicator="#spin-a">go</button>' +
        "</div>",
    );
    route("GET /anc", "swapped");

    fix.click("#btn-a");
    await new Promise((r) => setTimeout(r, 30));

    expect(fix.$("#spin-a").style.display).toBe("none");
    fix.remove();
  });
});

describe("x-swap modes", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test('x-swap="delete" removes the target element', async () => {
    fix = fixture(
      '<div id="row1">row</div>' +
        '<button id="btn-del" x-delete="/row" x-target="#row1" x-swap="delete">x</button>',
    );
    route("DELETE /row", "");

    const p = whenSwapped("row1");
    fix.click("#btn-del");
    await p;
    expect(document.getElementById("row1")).toBeNull();
  });

  test('x-swap="none" leaves the target untouched', async () => {
    fix = fixture(
      '<div id="untouched">before</div>' +
        '<button id="btn-none" x-get="/silent" x-target="#untouched" x-swap="none">go</button>',
    );
    route("GET /silent", "should not appear");

    const p = whenSwapped("untouched");
    fix.click("#btn-none");
    await p;
    expect(fix.$("#untouched").textContent.trim()).toBe("before");
  });

  test("missing x-target defaults to the triggering element", async () => {
    fix = fixture('<button id="btn-default" x-get="/def">before</button>');
    route("GET /def", "self-swapped");

    const p = whenSwapped("btn-default");
    fix.click("#btn-default");
    await p;
    expect(fix.$("#btn-default").textContent.trim()).toBe("self-swapped");
  });
});

describe("GET form must not send a body", () => {
  test("form with x-get omits the request body", async () => {
    let sent;
    window.fetch = (url, opts = {}) => {
      sent = opts;
      return Promise.resolve(new Response("ok"));
    };

    const fix = fixture(
      '<form x-get="/search" x-target="#res">' +
        '<input name="q" value="hi">' +
        '<button type="submit">go</button></form>' +
        '<div id="res">-</div>',
    );

    fix.click("button");
    await new Promise((r) => setTimeout(r, 30));

    expect(sent.body).toBeUndefined();
    fix.remove();
  });
});

describe("confirm cancel must clear indicator state", () => {
  let _confirm;
  beforeEach(() => {
    _confirm = window.confirm;
  });
  afterEach(() => {
    window.confirm = _confirm;
  });

  test("canceling x-confirm removes the htmx-request class", async () => {
    window.confirm = () => false;

    const fix = fixture(
      '<div id="spin-c" style="display:none">spinner</div>' +
        '<div id="t-c">-</div>' +
        '<button id="btn-c" x-get="/never" x-target="#t-c" x-confirm="sure?" x-indicator="#spin-c">go</button>',
    );
    route("GET /never", "should not appear");

    fix.click("#btn-c");
    await new Promise((r) => setTimeout(r, 30));

    expect(fix.$("#btn-c").classList.contains("htmx-request")).toBe(false);
    fix.remove();
  });
});

describe("trigger state must be independent per trigger", () => {
  test("a non-once trigger firing first must not block a later once trigger", async () => {
    let calls = 0;
    window.fetch = () => {
      calls++;
      return Promise.resolve(new Response("ok"));
    };

    const fix = fixture(
      '<button id="btn-multi" x-get="/multi" x-trigger="click once, mouseover">go</button>',
    );

    fix
      .$("#btn-multi")
      .dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    fix.click("#btn-multi");
    await new Promise((r) => setTimeout(r, 20));

    expect(calls).toBe(2);
    fix.remove();
  });
});

describe("innerHTML must unwrap when root tag matches target", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("innerHTML swap with matching wrapper tags", async () => {
    fix = fixture(
      '<ul id="bug2-list"><li>old item</li></ul>' +
        '<button id="bug2-btn" x-get="/list" x-target="#bug2-list">refresh</button>',
    );
    route(
      "GET /list",
      '<ul id="bug2-list" class="todo-list"><li>new item</li></ul>',
    );

    const p = whenSwapped("bug2-list");
    fix.click("#bug2-btn");
    await p;

    const list = fix.$("#bug2-list");
    const children = list.children;

    expect(children.length).toBe(1);
    expect(children[0].tagName).toBe("LI");
    expect(children[0].textContent.trim()).toBe("new item");
    expect(list.querySelectorAll("ul").length).toBe(0);
  });

  test("innerHTML with text-only response (no wrapper)", async () => {
    fix = fixture(
      '<div id="bug2-text">old</div>' +
        '<button id="bug2-btn2" x-get="/text" x-target="#bug2-text">go</button>',
    );
    route("GET /text", "plain text response");

    const p = whenSwapped("bug2-text");
    fix.click("#bug2-btn2");
    await p;

    expect(fix.$("#bug2-text").textContent.trim()).toBe("plain text response");
  });
});

describe("plugins — vals.js", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("x-vals sends a JSON body for non-form elements", async () => {
    let sent;
    window.fetch = (url, opts = {}) => {
      sent = opts;
      return Promise.resolve(new Response("ok"));
    };

    fix = fixture(
      '<div id="val1">-</div>' +
        '<button id="btn-val1" x-post="/save" x-target="#val1" x-vals=\'{"priority":"high"}\'>go</button>',
    );

    fix.click("#btn-val1");
    await new Promise((r) => setTimeout(r, 20));

    expect(JSON.parse(sent.body)).toEqual({ priority: "high" });
    expect(sent.headers["Content-Type"]).toBe("application/json");
  });

  test("x-vals merges into a form's body", async () => {
    let sent;
    window.fetch = (url, opts = {}) => {
      sent = opts;
      return Promise.resolve(new Response("ok"));
    };

    fix = fixture(
      '<form x-post="/save2" x-target="#val2" x-vals=\'{"source":"web"}\'>' +
        '<input name="name" value="test">' +
        '<button type="submit">go</button></form>' +
        '<div id="val2">-</div>',
    );

    fix.click("button");
    await new Promise((r) => setTimeout(r, 20));

    expect(sent.body.get("name")).toBe("test");
    expect(sent.body.get("source")).toBe("web");
  });

  test("x-vals must not attach a body to a GET request", async () => {
    let sent;
    window.fetch = (url, opts = {}) => {
      sent = opts;
      return Promise.resolve(new Response("ok"));
    };

    fix = fixture(
      '<div id="val3">-</div>' +
        '<button id="btn-val3" x-get="/search" x-target="#val3" x-vals=\'{"q":"hi"}\'>go</button>',
    );

    fix.click("#btn-val3");
    await new Promise((r) => setTimeout(r, 20));

    expect(sent.body).toBeUndefined();
  });
});

describe("plugins — validate.js", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("invalid form blocks the request", async () => {
    fix = fixture(
      '<div id="v1">-</div>' +
        '<form x-post="/submit" x-target="#v1" x-validate>' +
        '<input name="email" required>' +
        '<button type="submit">go</button></form>',
    );
    route("POST /submit", "ok");

    fix.click("button");
    await new Promise((r) => setTimeout(r, 30));

    expect(fix.$("#v1").textContent.trim()).toBe("-");
  });

  test("valid form proceeds", async () => {
    fix = fixture(
      '<div id="v2">-</div>' +
        '<form x-post="/submit2" x-target="#v2" x-validate>' +
        '<input name="email" required value="a@b.com">' +
        '<button type="submit">go</button></form>',
    );
    route("POST /submit2", "ok");

    const p = whenSwapped("v2");
    fix.click("button");
    await p;

    expect(fix.$("#v2").textContent.trim()).toBe("ok");
  });
});

describe("plugins — sync.js", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("default mode aborts the previous in-flight request", async () => {
    const signals = [];
    window.fetch = (url, opts = {}) => {
      signals.push(opts.signal);
      return new Promise(() => {});
    };

    fix = fixture(
      '<div id="res-sync">-</div>' +
        '<input id="inp-sync" x-get="/search" x-target="#res-sync" x-sync>',
    );

    fix.$("#inp-sync").dispatchEvent(new Event("change", { bubbles: true }));
    fix.$("#inp-sync").dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));

    expect(signals[0].aborted).toBe(true);
  });

  test('x-sync="drop" ignores a second request while one is in flight', async () => {
    let calls = 0;
    window.fetch = () => {
      calls++;
      return new Promise(() => {});
    };

    fix = fixture(
      '<div id="res-drop">-</div>' +
        '<button id="btn-drop" x-get="/d" x-target="#res-drop" x-sync="drop">go</button>',
    );

    fix.click("#btn-drop");
    fix.click("#btn-drop");
    await new Promise((r) => setTimeout(r, 20));

    expect(calls).toBe(1);
  });

  test(
    "elements without x-sync must not abort each other",
    async () => {
      let firstSignal;
      window.fetch = (url, opts = {}) => {
        if (!firstSignal) firstSignal = opts.signal;
        return new Promise(() => {});
      };

      fix = fixture(
        '<div id="result">-</div>' +
          '<button id="btn-a" x-get="/a" x-target="#result">A</button>' +
          '<button id="btn-b" x-get="/b" x-target="#result">B</button>',
      );

      fix.click("#btn-a");
      fix.click("#btn-b");
      await new Promise((r) => setTimeout(r, 20));

      expect(firstSignal?.aborted).toBeFalsy();
    },
  );
});

describe("plugins — select.js", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("x-select extracts a matching fragment from the response", async () => {
    fix = fixture(
      '<div id="sel1">-</div>' +
        '<button id="btn-sel1" x-get="/page" x-target="#sel1" x-select="#content">go</button>',
    );
    route(
      "GET /page",
      '<nav>ignored</nav><div id="content">picked</div><footer>ignored</footer>',
    );

    const p = whenSwapped("sel1");
    fix.click("#btn-sel1");
    await p;

    expect(fix.$("#sel1").textContent.trim()).toBe("picked");
    expect(fix.$("#sel1").querySelector("nav")).toBeNull();
  });

  test("x-select with no match falls back to the full response", async () => {
    fix = fixture(
      '<div id="sel2">-</div>' +
        '<button id="btn-sel2" x-get="/page2" x-target="#sel2" x-select="#missing">go</button>',
    );
    route("GET /page2", "<p>whole response</p>");

    const p = whenSwapped("sel2");
    fix.click("#btn-sel2");
    await p;

    expect(fix.$("#sel2").textContent.trim()).toBe("whole response");
  });
});

describe("plugins — include.js", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("x-include merges a single field's value into the body", async () => {
    let sent;
    window.fetch = (url, opts = {}) => {
      sent = opts;
      return Promise.resolve(new Response("ok"));
    };

    fix = fixture(
      '<input id="extra" name="tag" value="urgent">' +
        '<div id="inc1">-</div>' +
        '<button id="btn-inc1" x-post="/save" x-target="#inc1" x-include="#extra">go</button>',
    );

    fix.click("#btn-inc1");
    await new Promise((r) => setTimeout(r, 20));

    expect(sent.body.get("tag")).toBe("urgent");
  });

  test("x-include merges another form's fields into the body", async () => {
    let sent;
    window.fetch = (url, opts = {}) => {
      sent = opts;
      return Promise.resolve(new Response("ok"));
    };

    fix = fixture(
      '<form id="side-form"><input name="lang" value="en"></form>' +
        '<div id="inc2">-</div>' +
        '<button id="btn-inc2" x-post="/save2" x-target="#inc2" x-include="#side-form">go</button>',
    );

    fix.click("#btn-inc2");
    await new Promise((r) => setTimeout(r, 20));

    expect(sent.body.get("lang")).toBe("en");
  });

  test(
    "x-include must not attach a body to a GET request",
    async () => {
      let sent;
      window.fetch = (url, opts = {}) => {
        sent = opts;
        return Promise.resolve(new Response("ok"));
      };

      fix = fixture(
        '<input id="extra2" name="q" value="hi">' +
          '<div id="inc3">-</div>' +
          '<button id="btn-inc3" x-get="/search" x-target="#inc3" x-include="#extra2">go</button>',
      );

      fix.click("#btn-inc3");
      await new Promise((r) => setTimeout(r, 20));

      expect(sent.body).toBeUndefined();
    },
  );
});

describe("plugins — headers.js", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("x-headers are merged into the request", async () => {
    let sent;
    window.fetch = (url, opts = {}) => {
      sent = opts;
      return Promise.resolve(new Response("ok"));
    };

    fix = fixture(
      '<div id="hdr1">-</div>' +
        '<button id="btn-hdr1" x-get="/api" x-target="#hdr1" x-headers=\'{"Authorization":"Bearer tkn"}\'>go</button>',
    );

    fix.click("#btn-hdr1");
    await new Promise((r) => setTimeout(r, 20));

    expect(sent.headers.Authorization).toBe("Bearer tkn");
    expect(sent.headers["HX-Request"]).toBe("true");
  });

  test("malformed x-headers JSON is ignored, not thrown", async () => {
    let sent;
    window.fetch = (url, opts = {}) => {
      sent = opts;
      return Promise.resolve(new Response("ok"));
    };

    fix = fixture(
      '<div id="hdr2">-</div>' +
        '<button id="btn-hdr2" x-get="/api2" x-target="#hdr2" x-headers=\'not json\'>go</button>',
    );

    fix.click("#btn-hdr2");
    await new Promise((r) => setTimeout(r, 20));

    expect(sent.headers["HX-Request"]).toBe("true");
  });
});

describe("plugins — disable.js", () => {
  let fix, _confirm;
  beforeEach(() => {
    _confirm = window.confirm;
  });
  afterEach(() => {
    window.confirm = _confirm;
    if (fix) fix.remove();
  });

  test("element is disabled while the request is in flight", async () => {
    fix = fixture(
      '<div id="dis1">-</div>' +
        '<button id="btn-dis1" x-get="/dis" x-target="#dis1" x-disable>go</button>',
    );
    route("GET /dis", "ok");

    let disabledDuringSend = false;
    document.body.addEventListener(
      "x:beforeSend",
      () => {
        disabledDuringSend = fix.$("#btn-dis1").disabled;
      },
      { once: true },
    );

    const p = whenSwapped("dis1");
    fix.click("#btn-dis1");
    await p;

    expect(disabledDuringSend).toBe(true);
    expect(fix.$("#btn-dis1").disabled).toBe(false);
  });

  test(
    "a request cancelled before it's sent must not leave the element disabled forever",
    async () => {
      window.confirm = () => false;
      fix = fixture(
        '<div id="dis2">-</div>' +
          '<button id="btn-dis2" x-get="/dis2" x-target="#dis2" x-disable x-confirm="sure?">go</button>',
      );
      route("GET /dis2", "ok");

      fix.click("#btn-dis2");
      await new Promise((r) => setTimeout(r, 30));

      expect(fix.$("#btn-dis2").disabled).toBe(false);
    },
  );
});

describe("plugins — oob.js", () => {
  let fix;
  afterEach(() => {
    if (fix) fix.remove();
  });

  test("an oob fragment updates its own target, stripped from the primary swap", async () => {
    fix = fixture(
      '<div id="oob1">before</div>' +
        '<div id="t-oob1">-</div>' +
        '<button id="btn-oob1" x-get="/mixed" x-target="#t-oob1">go</button>',
    );
    route("GET /mixed", 'primary<div id="oob1" x-swap-oob>updated</div>');

    const p = whenSwapped("t-oob1");
    fix.click("#btn-oob1");
    await p;

    expect(fix.$("#t-oob1").textContent.trim()).toBe("primary");
    expect(fix.$("#oob1").textContent.trim()).toBe("updated");
  });

  test("multiple oob fragments in one response all get updated", async () => {
    fix = fixture(
      '<div id="oobA">A-before</div>' +
        '<div id="oobB">B-before</div>' +
        '<div id="t-oob2">-</div>' +
        '<button id="btn-oob2" x-get="/multi-oob" x-target="#t-oob2">go</button>',
    );
    route(
      "GET /multi-oob",
      'primary<div id="oobA" x-swap-oob>A-after</div><div id="oobB" x-swap-oob>B-after</div>',
    );

    const p = whenSwapped("t-oob2");
    fix.click("#btn-oob2");
    await p;

    expect(fix.$("#oobA").textContent.trim()).toBe("A-after");
    expect(fix.$("#oobB").textContent.trim()).toBe("B-after");
    expect(fix.$("#t-oob2").textContent.trim()).toBe("primary");
  });

  test("elements inside an oob fragment get scanned and bound", async () => {
    fix = fixture(
      '<div id="oob-widget">old</div>' +
        '<div id="t-oob3">-</div>' +
        '<button id="btn-oob3" x-get="/with-widget" x-target="#t-oob3">go</button>',
    );
    route(
      "GET /with-widget",
      'primary<div id="oob-widget" x-swap-oob>' +
        '<button id="inner-btn" x-get="/inner">inner</button></div>',
    );
    route("GET /inner", "clicked");

    const p = whenSwapped("t-oob3");
    fix.click("#btn-oob3");
    await p;

    const p2 = whenSwapped("inner-btn");
    fix.$("#inner-btn").click();
    await p2;
    expect(fix.$("#inner-btn").textContent.trim()).toBe("clicked");
  });

  test("a response that's oob-only cancels the primary swap", async () => {
    fix = fixture(
      '<div id="oob-only-target">before</div>' +
        '<div id="t-oob4">untouched</div>' +
        '<button id="btn-oob4" x-get="/oob-only" x-target="#t-oob4">go</button>',
    );
    route("GET /oob-only", '<div id="oob-only-target" x-swap-oob>updated</div>');

    fix.click("#btn-oob4");
    await new Promise((r) => setTimeout(r, 30));

    expect(fix.$("#oob-only-target").textContent.trim()).toBe("updated");
    expect(fix.$("#t-oob4").textContent.trim()).toBe("untouched");
  });

  test("an oob fragment with no matching target is skipped without throwing", async () => {
    fix = fixture(
      '<div id="t-oob5">-</div>' +
        '<button id="btn-oob5" x-get="/dangling-oob" x-target="#t-oob5">go</button>',
    );
    route(
      "GET /dangling-oob",
      'primary<div id="does-not-exist" x-swap-oob>orphan</div>',
    );

    const p = whenSwapped("t-oob5");
    fix.click("#btn-oob5");
    await p;

    expect(fix.$("#t-oob5").textContent.trim()).toBe("primary");
  });

  test("x-swap-oob value picks the swap mode", async () => {
    fix = fixture(
      '<div id="oob-inner"><span>old</span></div>' +
        '<div id="t-oob6">-</div>' +
        '<button id="btn-oob6" x-get="/oob-mode" x-target="#t-oob6">go</button>',
    );
    route(
      "GET /oob-mode",
      'primary<div id="oob-inner" x-swap-oob="innerHTML"><span>new</span></div>',
    );

    const p = whenSwapped("t-oob6");
    fix.click("#btn-oob6");
    await p;

    expect(fix.$("#oob-inner").children.length).toBe(1);
    expect(fix.$("#oob-inner span").textContent.trim()).toBe("new");
  });
});
