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

(code_cells)=
# Code Cells

```{index} single: Test Corpus; Code Cells
```

% Patterns from lecture-python-intro/status.md and lp_intro.md,
% lecture-python-programming/workspace.md and debugging.md,
% lecture-dp/amss.md (collapse-20, :load:) and lecture-python.myst generally.
% 8,843 code cells across the series: 6,799 `ipython3`, 1,726 `python3`,
% 277 `ipython`, 15 `python`, 26 with no language.

## Overview

Every lecture opens with an install cell whose output is hidden, then imports:

```{code-cell} ipython3
:tags: [hide-output]
!pip install --upgrade quantecon
```

```{code-cell} ipython3
import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
```

## Languages

The four language names in use render identically but reach the exporter
differently (`tojupyter_lang_synonyms` maps them all to `python3`):

```{code-cell} ipython3
x = np.linspace(0, 1, 5)
x
```

```{code-cell} python3
sum(x)
```

```{code-cell} ipython
print("an `ipython` cell")
```

```{code-cell} python
print("a `python` cell")
```

```{code-cell}
print("a cell with no language name (26 of them, all in lecture-python-intro)")
```

## Cell tags

Hidden input (236 uses), hidden output (261) and a hidden cell (16):

```{code-cell} ipython3
:tags: [hide-input]
print("the input of this cell is folded behind a toggle")
```

```{code-cell} ipython3
:tags: [hide-output]
for i in range(3):
    print(f"the output of this cell is folded: line {i}")
```

```{code-cell} ipython3
:tags: [hide-cell]
# This whole cell is folded: matplotlib defaults for the rest of the page.
plt.rcParams["figure.figsize"] = (8, 5)
```

Tags written in the YAML option block rather than as a `:tags:` line, the form
used together with `mystnb` metadata:

```{code-cell} ipython3
---
tags: [hide-output]
---
print("tags from a YAML option block")
```

A cell that raises, tagged `raises-exception` (22 uses, mostly the
programming series):

```{code-cell} ipython3
:tags: [raises-exception]
1 / 0
```

A cell tagged `skip-execution` (6 uses) is shown but never run:

```{code-cell} ipython3
:tags: [skip-execution]
import this_module_does_not_exist
```

Long output with the two scroll tags in use, `output_scroll` (myst-nb) and
`scroll-output` (its Jupyter Book 1 spelling):

```{code-cell} ipython3
:tags: [output_scroll]
for i in range(60):
    print(f"line {i:02d} of a long output that should scroll")
```

```{code-cell} ipython3
:tags: [scroll-output]
for i in range(60):
    print(f"line {i:02d} of a long output that should scroll")
```

The `collapse-20` tag (21 uses in the dynamic-programming lectures) is a
legacy Jupinx tag with no effect in either stack:

```{code-cell} ipython3
:tags: [collapse-20]
def u(c, gamma=2.0):
    return (c**(1 - gamma) - 1) / (1 - gamma)
```

## Cell options

`:load:` pulls the cell's source from a file (40 uses, three series):

```{code-cell} python3
:load: _static/lecture_specific/code/loaded_script.py
```

```{code-cell} python3
present_value([100, 100, 100]), crra_utility(2.0)
```

A caption and line numbers on a cell (the `workspace.md` pattern):

```{code-cell} ipython3
:caption: sine_wave.py
:lineno-start: 1

import numpy as np
x = np.linspace(0, 2 * np.pi, 100)
y = np.sin(x)
```

## Output types

Standard output and a warning on standard error, which the streams setting
`nb_merge_streams` merges and the Sphinx theme folds behind a "Code warnings"
toggle:

```{code-cell} ipython3
import warnings
print("this goes to stdout")
warnings.warn("this goes to stderr and is folded by the theme")
print("and this to stdout again")
```

A pandas `DataFrame`, rendered from its HTML representation:

```{code-cell} ipython3
df = pd.DataFrame({"country": ["AUS", "JPN", "USA"],
                   "gdp_pc": [49_000, 40_000, 63_000],
                   "growth": [0.021, 0.008, 0.017]})
df
```

A `Series` and a plain repr:

```{code-cell} ipython3
df.set_index("country")["growth"]
```

```{code-cell} ipython3
{"mean": df.growth.mean(), "n": len(df)}
```

An interactive plotly figure (24 cells in six files rely on the
`require.js` script the Sphinx config loads):

```{code-cell} ipython3
import plotly.express as px
fig = px.scatter(df, x="gdp_pc", y="growth", text="country",
                 title="Growth against GDP per capita")
fig.show()
```

IPython magics: a cell magic timing its body, and a line magic:

```{code-cell} ipython3
%%time
total = sum(i * i for i in range(200_000))
```

```{code-cell} ipython3
%time np.linalg.eigvals(np.eye(50)).sum()
```

IPython help with a trailing question mark:

```{code-cell} ipython3
np.linspace?
```

## Code that is not executed

A `{code-block}` (35 uses) with a language and, in the debugging lecture, a
`no-execute` class:

```{code-block} python3
:class: no-execute
jv = JVWorker(grid_size=25, mc_size=50)
plot_grid = np.linspace(0, 1.2, 100)
```

A `{code-block}` with a caption and numbered lines:

```{code-block} python
:caption: second_script.py
:lineno-start: 1
def f(x):
    return x ** 2
```

Plain fenced code with a language, with `bash`, and with none:

```python
def f(x):
    return x ** 2
```

```bash
pip install --upgrade quantecon
```

```
plain text in a fence with no language
```

And inline code inside prose: `np.linspace(0, 1, 5)`.
