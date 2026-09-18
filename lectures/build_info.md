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
    # Sphinx-stack counterpart: the container image this build ran in. The
    # Sphinx toolchain is supplied by the image, not by environment.yml, so
    # without this row nothing identifies which theme build a pass measured.
    ("QE_CONTAINER (CI pin)", os.environ.get("QE_CONTAINER", "not set")),
    # execution kernel
    ("ipykernel", pkg("ipykernel")),
    ("jupyter-server", pkg("jupyter-server")),
    ("numpy", pkg("numpy")),
    ("scipy", pkg("scipy")),
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
import importlib.metadata as md, os, pathlib, re, subprocess

try:
    import yaml  # PyYAML: present in both build environments, never required here.
except ImportError:
    yaml = None

def git(*args):
    """Return (output, problem): git's answer, or an empty string and the reason.

    git refuses a work tree it does not own -- the ordinary state inside a job
    container, where the runner creates the workspace and the container runs as
    root. That refusal writes to stderr and leaves stdout empty, which is how
    this row came to read "unknown"; the reason is now reported, not swallowed.

    The exemption is scoped to this checkout. `-c` is command-scope
    configuration, which git counts as protected and honours; GITHUB_WORKSPACE
    is the checkout root on every Actions runner, and outside CI you own your
    checkout and need none. It must name the worktree root, not the current
    directory: this page runs in lectures/, and git refuses an exemption scoped
    to a subdirectory.
    """
    workspace = os.environ.get("GITHUB_WORKSPACE", "")
    scope = ["-c", f"safe.directory={workspace}"] if workspace else []
    try:
        out = subprocess.run(["git", *scope, *args],
                             capture_output=True, text=True, timeout=30)
    except Exception as e:  # noqa: BLE001 - a build-info page must never fail the build
        return "", f"{type(e).__name__}: {e}"
    if out.returncode != 0:
        detail = out.stderr.strip() or out.stdout.strip() or "no output"
        return "", f"git exit {out.returncode}: {detail.splitlines()[0]}"
    value = out.stdout.strip()
    return value, "" if value else "git produced no output"

sha, sha_problem = git("rev-parse", "--short", "HEAD")
date, date_problem = git("log", "-1", "--format=%cs")
note = ""
if not sha:
    # Every GitHub Actions runner sets these, container or not.
    env_sha, env_ref = os.environ.get("GITHUB_SHA", ""), os.environ.get("GITHUB_REF_NAME", "")
    sha = env_sha[:7] if env_sha else "unknown"
    date = date or (f"ref {env_ref}" if env_ref else "date unavailable")
    note = f"  [{'GITHUB_SHA' if env_sha else 'no fallback'}; {sha_problem}]"
elif not date:
    date, note = "date unavailable", f"  [{date_problem}]"
print(f"repository commit   {sha}  ({date}){note}")

def dig(path, *keys):
    """The scalar at `keys` in a YAML config file, or None.

    PyYAML when it is importable, otherwise a block walk that narrows to each
    key's own indented block in turn. Either way a same-named key under a
    different parent -- `numbering.figure.template` in myst.yml, which an
    unanchored regex reads as the site template -- cannot be mistaken for the
    one asked for, and a commented-out key never wins.
    """
    try:
        text = path.read_text()
    except Exception:  # noqa: BLE001
        return None
    if yaml is not None:
        try:
            node = yaml.safe_load(text)
            for key in keys:
                if not isinstance(node, dict):
                    return None
                node = node.get(key)
            return node if isinstance(node, str) else None
        except Exception:  # noqa: BLE001 - fall through to the block walk
            pass
    block = text
    for i, key in enumerate(keys):
        found = re.search(rf"(?m)^([ \t]*){re.escape(key)}:[ \t]*(.*)$", block)
        if not found:
            return None
        value = found.group(2).split(" #")[0].strip().strip("\"'")
        if i == len(keys) - 1:
            return value or None
        if value:
            return None  # a scalar where a mapping was expected
        rest = block[found.end():]
        end = re.search(rf"(?m)^[ \t]{{0,{len(found.group(1))}}}\S", rest)
        block = rest[:end.start()] if end else rest
    return None

def theme_version(dist):
    try:
        return md.version(dist.replace("_", "-"))
    except Exception:  # noqa: BLE001
        return "(version above)"

def template_name(template):
    """A mystmd site template as name and version.

    A pinned QuantEcon release is a URL ending
    `<theme-repo>/releases/download/<tag>/<name>.zip`; a built-in theme is a
    bare name such as `book-theme`.
    """
    release = re.search(r"/([^/]+)/releases/download/([^/]+)/", template)
    if release:
        return f"{release.group(1)} {release.group(2)}"
    return f"{template} (built in)" if "/" not in template else template

here = pathlib.Path.cwd()
config = here / "_config.yml"
if config.exists():
    theme = dig(config, "sphinx", "config", "html_theme")
    print(f"stack               Jupyter Book 1 / Sphinx, theme {theme or '?'} {theme_version(theme) if theme else ''}".rstrip())
myst_yml = here / "myst.yml"
if myst_yml.exists():
    template = dig(myst_yml, "site", "template")
    print(f"stack               mystmd, theme {template_name(template) if template else 'default (myst book-theme)'}")
# The Sphinx toolchain is supplied by the build container, not by this repo's
# environment.yml, so the image is part of the provenance. The marker is written
# by the image itself, so it describes the image that actually ran -- unlike a
# hand-maintained pin, it cannot drift.
marker = pathlib.Path("/etc/quantecon-container")
if marker.exists():
    for line in marker.read_text().splitlines()[1:]:
        if line.strip():
            print(f"container: {line.strip()}")

source = here / "SOURCE.yml"
if source.exists():
    for line in source.read_text().splitlines():
        if line and not line.startswith("#"):
            print(f"derived: {line}")
```
