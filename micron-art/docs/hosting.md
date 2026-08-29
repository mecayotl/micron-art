# Hosting converted pages on a NomadNet node

Getting `.mu` output onto a real node and confirming it renders before
you announce it.

**Provenance.** Everything below marked as fact was read out of the
installed NomadNet source (version 0.6.4, `nomadnet/Node.py`,
`nomadnet/NomadNetworkApp.py`, `nomadnet/ui/textui/Browser.py`) and is
cited by file and line. Nothing here is from memory. Points that need
checking on a **running** node are marked **TODO** — see the end of this
document for the list.

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
removed are not deregistered on rescan. A deleted page may keep serving
until restart.

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
per depth level, so a page with headings has less room than the raw
terminal width suggests.

**3. Open it in the browser.** Run NomadNet and navigate to your own
node's `/page/index.mu`.

**TODO — the exact local-browsing steps are not verified.** I can see
that `Browser.DEFAULT_PATH` is `/page/index.mu` and that an empty
destination resolves to the current node, but I have not confirmed the
keystrokes or whether a node can browse itself without an announce
having propagated. Fill this in from a running install.

## What still needs checking on a live node

None of these could be settled by reading source alone:

1. **Browsing your own node locally.** Does a node serve itself, and
   what is the exact navigation? If self-browsing does not work, what is
   the minimum second endpoint needed to test?
2. **Whether an announce is required** before a page is reachable, or
   only for discovery by others.
3. **Config directory in practice.** The resolution order above is from
   source; confirm which directory your install actually chose. `ls -d
   ~/.nomadnetwork ~/.config/nomadnetwork` settles it in one command.
4. **Restart behaviour.** Confirm that adding a page with
   `page_refresh_interval = 0` really does need a restart, and that a
   non-zero interval picks pages up without one.
5. **Deleted pages.** The source comment says removed pages are not
   deregistered. Confirm whether a deleted page keeps serving until
   restart, and note it here if so.
6. **Executable pages end to end.** Confirm the executable bit alone is
   sufficient, and that a script writing Micron to stdout is rendered
   rather than shown as text.
7. **`.allowed` files.** Confirm the hash format expected — the source
   reads fixed-length hex and skips anything else, so a wrong length
   fails silently rather than erroring.

Items 3 to 5 are quick. Items 1, 2, 6 and 7 need a second node or a
second identity to be meaningful.
