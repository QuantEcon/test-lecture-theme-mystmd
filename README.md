# test-lecture-theme-mystmd

*The QuantEcon theme-parity corpus built on the mystmd stack: the same content as [`test-lecture-theme-sphinx`](https://github.com/QuantEcon/test-lecture-theme-sphinx), built with the QuantEcon mystmd fork and `quantecon-theme.mystmd`, so the two renderings can be compared feature by feature.*

Last updated: 2026-09-16

> **This is a test repository.** Nothing here is a lecture. Do not link to it from a lecture site.

## Where the content comes from

`lectures/` is **derived, not authored**. `bin/sync-from-sphinx` copies the Sphinx corpus at a given checkout, applies the source rewrites the migration has decided on, and writes `lectures/SOURCE.yml` recording the commits it read. The `sync-check` workflow re-derives the tree on every pull request and fails if a hand edit crept in. To change content, change the Sphinx corpus and re-sync:

```bash
bin/sync-from-sphinx ../test-lecture-theme-sphinx ../quantecon-theme.mystmd
```

Today one rewrite is applied, the theme's `scripts/rewrite-raw-blocks.mjs` (QuantEcon/quantecon-theme.mystmd#204): the notebook logo header is deleted from every page, the Our World in Data `{raw} html` iframe becomes `{iframe}`. Every construct the migration has **not** decided (QuantEcon/workspace-lectures#64) is copied as written -- `{only}`, `{youtube}`, `{glue:figure}`, `{nb-exec-table}`, the scroll tags, `{prf:Theorem}`, `{any}`, `{todo}` -- so the build shows what each does on mystmd today. A decision adds a rule to the sync script, and the diff between the two repositories' `lectures/` directories is the migration rewrite itself.

`lectures/myst.yml` is the hand-written counterpart of the Sphinx `_config.yml` and `_toc.yml`, following the theme's migration checklist (`docs/migrating.md`) and the experimental jb2 build of `lecture-python-programming`.

## Building

The engine is the **QuantEcon mystmd fork**, built from a pinned commit (`QE_MYSTMD_SHA` in `.github/workflows/ci.yml`, tag `qe-v10`), not the `mystmd` npm release and not `jupyter-book>=2`. The fork carries the features the lectures depend on ahead of upstream, and the `jupyter-book` 2 package bundles a compiled upstream engine that cannot be swapped. Locally:

```bash
git clone --depth 1 https://github.com/QuantEcon/mystmd /tmp/qe-mystmd && cd /tmp/qe-mystmd && bun install && bun run build
npm install -g /tmp/qe-mystmd/packages/mystmd     # `myst --version` prints v1.10.1 (qe-v10)
pip install -r requirements.txt                    # the kernel that executes the cells
cd lectures && myst build --html --execute
```

`myst start` serves the site with hot reload. The theme is a pinned release zip (`site.template` in `myst.yml`); the git-history header needs a full-depth checkout.

## Relationship to other repositories

- **`test-lecture-theme-sphinx`** is the source of the content and the reference rendering.
- **`quantecon-theme.mystmd`** is the theme under test; `tests/visual/fixture/` there is the theme's own small fixture, which this corpus does not replace.
- **`workspace-themes`** holds the parity project's tracker and plan.
