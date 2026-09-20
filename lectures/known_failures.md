---
jupytext:
  text_representation:
    extension: .md
    format_name: myst
kernelspec:
  display_name: Python 3
  language: python
  name: python3
mystnb:
  execution_allow_errors: true
---

(known_failures)=
# Known Failures

```{index} single: Test Corpus; Known Failures
```

% Execution outcomes, not markup: how each stack renders a cell that errors,
% halts, floods the page or is skipped (QuantEcon/test-lecture-theme-sphinx#2).
% The tagged error follows lecture-python-programming/debugging.md and
% python_advanced_features.md @ b0b0b566 (17 of the 22 `raises-exception` cells);
% `skip-execution` follows lecture-python-advanced.myst/matsuyama.md @ d1f6ec29.
% The stderr, long-output, DataFrame and untagged-error cells are synthetic:
% they are outcomes a lecture can produce, not patterns copied from one.
%
% This page is on its own, and the untagged error is its last cell, so that a
% halt cannot hide any other surface of the corpus.
%
% The `mystnb: execution_allow_errors: true` line in the frontmatter is what
% lets this page exist on the Sphinx stack. Without it myst-nb reports
% `Executing notebook failed: CellExecutionError [mystnb.exec]`, and under the
% `-W` flag every lecture repository builds with, that warning fails the build:
% an untagged error never reaches a published Sphinx site. mystmd ignores the
% key (it warns that the frontmatter key is extra) and applies its own rule.

## Overview

A lecture page can fail in ways that are part of the lecture, and in ways that
are not. This page collects both, so the two stacks' handling of each can be
compared: what the reader sees, and what happens to the cells that follow.

```{code-cell} ipython3
import sys
import warnings
import numpy as np
import pandas as pd
```

## An error that is part of the lecture

Tagged `raises-exception` (22 uses). The traceback is the content, and the
cells after it must still run:

```{code-cell} ipython3
:tags: [raises-exception]

prices = {"apple": 1.2, "pear": 0.9}
prices["quince"]
```

```{code-cell} ipython3
print("this cell follows a tagged error and must have run")
```

## A cell that is never run

Tagged `skip-execution` (6 uses). It would fail if it ran; it must show its
source and no output:

```{code-cell} ipython3
:tags: [skip-execution]

import a_package_that_is_not_installed
a_package_that_is_not_installed.run()
```

## Output on standard error

A warning and a direct write to `stderr`, between two lines on `stdout`. The
Sphinx stack merges the streams (`nb_merge_streams`) and its theme folds the
warning behind a toggle:

```{code-cell} ipython3
print("stdout, before")
warnings.warn("a warning, which goes to stderr")
print("written straight to stderr", file=sys.stderr)
print("stdout, after")
```

## An output longer than the scroll cap, with no tag

The scroll tags cap an output at 24 em. This cell prints 120 lines and carries
no tag, which is what a lecture author gets by default:

```{code-cell} ipython3
for i in range(120):
    print(f"line {i:03d} of an untagged long output")
```

## A wide DataFrame

Twenty columns, wider than the text column at every viewport. The table must
scroll sideways inside its own box rather than widen the page:

```{code-cell} ipython3
rng = np.random.default_rng(1234)
wide = pd.DataFrame(rng.normal(size=(6, 20)).round(3),
                    columns=[f"indicator_{j:02d}" for j in range(20)])
wide
```

And a tall one, which pandas truncates in the middle:

```{code-cell} ipython3
pd.DataFrame({"t": range(200), "x": rng.normal(size=200).cumsum().round(3)})
```

## An error that is not part of the lecture

% Last on the page on purpose; see the comment at the top.

No tag. This is a mistake, the kind a typo makes. On the Sphinx stack the page
allows errors so that the build can publish it; by default the build would
fail. The question for each stack is what the reader sees here, and whether
the cell after it has an output:

```{code-cell} ipython3
total = undefined_quantity + 1
```

```{code-cell} ipython3
print("this cell follows an untagged error: did it run?")
```
