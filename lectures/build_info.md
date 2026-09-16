---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
---
(build_info)=
# Build Information

This page is generated when the site is built: every value below is read from
the environment the code cells ran in, never typed by hand. The comparison
harness reads it to know which engine, theme and library versions produced
the site it is looking at. A cell reports "not installed" for the parts of
the other stack, so the same page builds on both.

## The stack that built this page

```{code-cell} ipython3
import datetime, importlib.metadata as md, os, platform, shutil, subprocess, sys

def pkg(name):
    try:
        return md.version(name)
    except md.PackageNotFoundError:
        return "not installed"

def cmd(*args):
    exe = shutil.which(args[0])
    if exe is None:
        return "not installed"
    try:
        out = subprocess.run([exe, *args[1:]], capture_output=True, text=True, timeout=60)
        return (out.stdout or out.stderr).strip().splitlines()[0]
    except Exception as e:  # noqa: BLE001 - a build-info page must never fail the build
        return f"error: {e}"

rows = [
    ("Built (UTC)", datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M")),
    ("Python", platform.python_version()),
    ("Node", cmd("node", "--version")),
    # Sphinx / Jupyter Book 1 stack
    ("jupyter-book", pkg("jupyter-book")),
    ("sphinx", pkg("sphinx")),
    ("myst-parser", pkg("myst-parser")),
    ("myst-nb", pkg("myst-nb")),
    ("quantecon-book-theme", pkg("quantecon-book-theme")),
    ("sphinx-exercise", pkg("sphinx-exercise")),
    ("sphinx-proof", pkg("sphinx-proof")),
    ("sphinx-togglebutton", pkg("sphinx-togglebutton")),
    ("sphinx-tojupyter", pkg("sphinx-tojupyter")),
    ("sphinxcontrib-youtube", pkg("sphinxcontrib-youtube")),
    # mystmd stack
    ("myst CLI", cmd("myst", "--version")),
    ("QE_MYSTMD_SHA (CI pin)", os.environ.get("QE_MYSTMD_SHA", "not set")),
    # execution kernel
    ("ipykernel", pkg("ipykernel")),
    ("jupyter-server", pkg("jupyter-server")),
    ("numpy", pkg("numpy")),
    ("matplotlib", pkg("matplotlib")),
    ("pandas", pkg("pandas")),
    ("plotly", pkg("plotly")),
    ("quantecon", pkg("quantecon")),
]
width = max(len(k) for k, _ in rows)
for k, v in rows:
    print(f"{k:<{width}}  {v}")
```

## The theme and the sources

The theme is pinned in the project configuration; the sources are the
repository at the commit being built. On the mystmd side `SOURCE.yml` names
the Sphinx-corpus commit the sources were derived from.

```{code-cell} ipython3
import pathlib, re, subprocess

def git(*args):
    try:
        return subprocess.run(["git", *args], capture_output=True, text=True, timeout=30).stdout.strip() or "unknown"
    except Exception:  # noqa: BLE001
        return "unknown"

print(f"repository commit   {git('rev-parse', '--short', 'HEAD')}  ({git('log', '-1', '--format=%cs')})")

here = pathlib.Path.cwd()
config = here / "_config.yml"
if config.exists():
    text = config.read_text()
    theme = re.search(r"html_theme:\s*(\S+)", text)
    print(f"stack               Jupyter Book 1 / Sphinx, theme {theme.group(1) if theme else '?'} (version above)")
myst_yml = here / "myst.yml"
if myst_yml.exists():
    text = myst_yml.read_text()
    template = re.search(r"template:\s*(\S+)", text)
    print(f"stack               mystmd, theme {template.group(1) if template else '?'}")
source = here / "SOURCE.yml"
if source.exists():
    for line in source.read_text().splitlines():
        if line and not line.startswith("#"):
            print(f"derived: {line}")
```
