# Hosting converted pages on a NomadNet node

Getting `.mu` output onto a real node and confirming it renders before
you announce it.

**Provenance.** Everything below marked as fact was read out of the
installed NomadNet source (version 0.9.8, `nomadnet/Node.py`,
`nomadnet/NomadNetworkApp.py`, `nomadnet/ui/textui/Browser.py`) and is
cited by file and line. Nothing here is from memory. Points that need
checking were resolved by driving NomadNet's own code paths directly —
its real `serve_page` and `register_pages`, with the network stubbed out
— rather than by running a node on a live mesh. Where that distinction
matters, it is stated.

## Where pages live

A node serves pages from `storage/pages` inside its config directory
(`NomadNetworkApp.py:111`). The config directory is resolved in this
order (`NomadNetworkApp.py:28-34`):

1. `/etc/nomadnetwork` — only if that directory **and** the file
   `/etc/nomadnetwork/config` both exist
2. `~/.config/nomadnetwork` — same condition, directory and `config`
   file both present
3. `~/.nomadnetwork` — the fallback when neither of the above applies

So on a typical single-user install, pages go in:

    ~/.nomadnetwork/storage/pages/

Both paths can be overridden in the config file
(`NomadNetworkApp.py:927,939`):

    [node]
    pages_path = /srv/nomadnet/pages
    files_path = /srv/nomadnet/files

Files for download are separate, under `storage/files`
(`NomadNetworkApp.py:112`).

## How a page becomes a URL

The node scans the pages directory recursively and registers each file
it finds (`Node.py:87-96`). A request path is `/page` followed by the
file's path relative to the pages directory (`Node.py:67`):

    storage/pages/index.mu          ->  /page/index.mu
    storage/pages/gallery.mu        ->  /page/gallery.mu
    storage/pages/art/banner.mu     ->  /page/art/banner.mu

Subdirectories work and keep their structure.

## Why `index.mu` is the default

The browser's default path is `/page/index.mu`
(`Browser.py:67`), so that is what opens when someone visits your node
without asking for a specific page.

If you have not written one, the node registers a built-in placeholder
at that path instead of failing (`Node.py:60-63`). Seeing a generic
index means your file is not where the node is looking.

## New pages are not picked up automatically

`register_pages()` runs when the node starts (`Node.py:30`). After that
it only re-runs on a timer, and **only if `page_refresh_interval` is
greater than zero** (`Node.py:231-233`). That setting defaults to `0`
(`NomadNetworkApp.py:122`), meaning no rescan at all.

So on a default install, **adding a page requires restarting NomadNet**.
To avoid that, set a refresh interval in minutes:

    [node]
    page_refresh_interval = 5
    file_refresh_interval = 5

Note the comment in the source at `Node.py:55`: pages that have been
removed are not deregistered on rescan. The stale handler stays
registered, but requests to it fail rather than serving old content —
the file is gone, so `serve_page` returns nothing. See "Verified
behaviour" below.

This applies to remote requests only. Browsing your own node reads the
filesystem directly, so your own changes appear without a restart.

## Static versus executable pages

A page is executed rather than read **if its executable bit is set**
(`Node.py:163`):

    if not is_windows() and os.access(file_path, os.X_OK):
        generated = subprocess.run([file_path], stdout=PIPE, ...)
        return generated.stdout
    else:
        return open(file_path, "rb").read()

That is the whole mechanism. There is no separate directory, extension
or config flag — the executable bit alone decides.

**Static.** Not executable. The file's bytes are served exactly as they
are. This is what the converter produces, and what you want for art.

    chmod 644 ~/.nomadnetwork/storage/pages/gallery.mu

**Executable.** Any program whose stdout is Micron markup. It receives
these environment variables (`Node.py:164-177`):

| Variable | Contents |
|---|---|
| `PATH` | inherited from the node process |
| `link_id` | the requesting link's ID, hex |
| `remote_identity` | requester's identity hash, hex |
| `field_*`, `var_*` | fields and variables from the request |

stderr is discarded (`stderr=subprocess.DEVNULL`), so a crashing script
fails silently with an empty page. Test it standalone first.

A converted art file made executable would be run as a shell script and
fail. Keep art static.

**Careful with the executable bit.** It is easy to set by accident —
copying from a FAT/exFAT volume, extracting some archives, or a `chmod
-R +x`. A `.mu` file that suddenly serves nothing is worth checking with
`ls -l` before anything else.

## Access control

Any page can be restricted by putting a file beside it with `.allowed`
appended (`Node.py:119-155`). For `gallery.mu` that is
`gallery.mu.allowed`.

It contains identity hashes, one per line. Only those identities are
served; everyone else gets a refusal. If the `.allowed` file is itself
executable it is run and its stdout used as the list, which allows a
dynamic allowlist.

No `.allowed` file means the page is public.

A hash of the wrong length is skipped silently, so a file of nothing but
mistyped hashes is an empty allowlist and denies everyone. Lines must be
exactly 32 hex characters. Note also that this is applied on the
remote-serving path only — browsing the page on your own node bypasses
it.

## Linking between pages

Micron link syntax is a backtick, then the label and URL in brackets,
separated by a backtick (`MicronParser.py:623-651`):

    `[Gallery`:/page/gallery.mu]

A URL whose destination part is empty — everything before the `:` —
resolves against the node currently being browsed
(`Browser.py:retrieve_url`, `components[0]` empty). That is what you want
for links within your own node, and it keeps pages portable: the same
file works regardless of the node's address.

To link to a different node, put its destination hash before the colon:

    `[Their page`a1b2c3...:/page/index.mu]

With no label, the URL is shown as the label. See
`examples/index.mu` and `examples/gallery.mu`, which link to each other
this way.

## Testing before you announce

Convert, install, restart, then look at it — in that order.

    micronart -m literal art.txt > ~/.nomadnetwork/storage/pages/art.mu

Three checks worth doing before anyone else sees the page:

**1. Read the markup.** Comment lines starting with `#` are dropped
before rendering, which is why the generated examples put their
provenance there. If a line of art starts with `-`, `#`, `>` or `<` and
is not escaped, it will be mangled — that is the whole reason the
converter exists. `examples/gallery.mu` shows exactly what that failure
looks like.

**2. Check the width.** Art wider than the viewer's terminal wraps and
the shape is destroyed. Content inside a section is indented two columns
per depth level, so art under a heading has less room than the raw
terminal width suggests.

Width is measured in **columns, not characters** — box-drawing glyphs are
one column each, CJK glyphs are two. `chafa --size` is the easiest way
to bring a conversion down to a target width.

**A client can make a correct page look broken.** Wrapping happens in the
viewer, not in the markup, so the same `.mu` file renders cleanly in one
client and sheared in another that is narrower, indents differently, or
themes differently. Before concluding the conversion is wrong, open the
page on the node itself. A conversion that is byte-identical to its
source art at the art's own width is correct however it happens to look
in a particular window.

**3. Open it in the browser.** Run NomadNet and browse your own node.

This is worth understanding, because it is **not a network request**.
When the browser's destination matches its own node, it reads the page
**straight off the filesystem** and skips Reticulum entirely
(`Browser.py:1064-1090`; the loopback hash is set at
`Network.py:1621`). The executable bit is honoured locally too.

Two consequences, both useful:

- **A new or edited page shows immediately.** The loopback path never
  consults the registered handlers, so no restart is needed to see your
  own changes.
- **It does not prove the page is reachable by anyone else.** Local
  browsing succeeds for a page that was never registered, and it does
  **not** apply `.allowed` — access control lives on the remote-serving
  path only. A page can look perfect locally and be unreachable, or
  unexpectedly public, remotely.

For anyone else to reach the node, Reticulum needs a path to it:
`RNS.Transport.has_path()` must be true, and the browser calls
`request_path()` and waits if it is not (`Browser.py:814`). Paths come
from announces propagating, so an announce is what makes the node
reachable by others — not what makes the page work.

## Verified behaviour

These were open questions in the first draft of this document. Each was
settled by exercising the real code with the network stubbed out.

**Config directory.** This install resolved to `~/.nomadnetwork`, which
holds a `config` file and a populated `storage/` including `pages`.
Neither `/etc/nomadnetwork` nor `~/.config/nomadnetwork` exists here, so
the third branch of the resolution order applied.

**A page added after startup is not served remotely until pages are
registered again.** Confirmed by driving `register_pages` directly:
after startup the handlers were `/page/index.mu` and `/page/one.mu`;
adding `two.mu` left them unchanged; running `register_pages` again
picked it up. With `page_refresh_interval` at its default of `0` there
is no rescan, so that means a restart. Local loopback browsing is
unaffected, as above.

**A deleted page stops working, it does not keep serving.** The handler
is never deregistered — the source says as much — but the file is gone,
so the request raises and `serve_page` returns `None`. Confirmed: the
same path returned its content before deletion and `None` after. An
earlier draft of this document suggested it might keep serving stale
content; that was wrong.

**The executable bit alone is sufficient.** Confirmed end to end
against the real `serve_page`:

| Page | Result |
|---|---|
| not executable | file bytes, verbatim |
| executable | the process's stdout |

The environment variables arrive as documented — a script printing
`$remote_identity`, `$link_id` and `$var_x` received the requesting
identity hash, the link id, and a request variable.

**`.allowed` expects 32 hex characters per line.** That is
`RNS.Identity.TRUNCATED_HASHLENGTH`, 128 bits, as hex. Confirmed
behaviour:

| Case | Result |
|---|---|
| identity in the list | page served |
| identity not in the list | "Request Not Allowed" |
| no identity at all | "Request Not Allowed" |
| **hash of the wrong length** | **"Request Not Allowed"** |
| executable `.allowed` | its stdout used as the list |

The fourth row is the trap. A mistyped or truncated hash is skipped
silently, and a file containing only bad lines produces an empty
allowlist, which denies everyone. There is no error to tell you why.

## Page colours

Not a hosting question, but it surfaced here and is easy to miss. The
browser scans the markup for `#!bg=` and `#!fg=` followed by exactly
three characters, and uses them as the page background and foreground
(`Browser.py:1094` onward). Both start with `#`, so Micron drops them
as comments before rendering — they are configuration read out of the
document rather than markup.

## What is still unverified

Only one thing, and it is a Reticulum property rather than a NomadNet
one:

**How long an announce takes to propagate**, and therefore how soon
after starting a node another peer can reach it. The code path is clear
— a path is requested and waited for — but the timing depends on the
mesh, not on anything in this repository. Watching a real request
arrive from a second node is the only way to see it.

Everything above was verified against NomadNet's own code with the
network stubbed. That establishes what the software does; it does not
establish that a particular mesh will route to you.
