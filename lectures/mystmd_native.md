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

(mystmd_native)=
# mystmd-native Constructs

```{index} single: Test Corpus; mystmd-native Constructs
```

% THIS PAGE HAS NO SPHINX COUNTERPART. It is not in `_toc.yml`, and with
% `only_build_toc_files: true` the Jupyter Book 1 build never reads it: the
% `{figure} #label` form below is an error there. It lives in this repository
% because this is where the corpus is edited; `bin/sync-from-sphinx` copies it to
% test-lecture-theme-mystmd, whose `myst.yml` lists it.
%
% Pattern from lecture-wasm/business_cycle.md @ 669c65fb, the one series written
% for mystmd: 89 labelled code cells across 13 files, each embedded by a
% `{figure}` that gives it a caption and its own label. It is also the form the
% decided `mystnb.figure` rewrite produces (QuantEcon/mystmd#114, SYNTAX.md).

## Overview

One lecture series, `lecture-wasm`, is written for mystmd rather than migrated
to it. Its figures do not use `mystnb` metadata. A code cell carries a
`:label:`, and a `{figure}` directive whose argument is `#that-label` embeds
the cell's output, gives it a caption and numbers it.

```{code-cell} ipython3
import numpy as np
import matplotlib.pyplot as plt
```

## A labelled cell, embedded by a figure

```{code-cell} ipython3
:label: native-plot-fig-1
rng = np.random.default_rng(1234)
growth = 2 + rng.normal(size=60).cumsum() * 0.3

fig, ax = plt.subplots()
ax.plot(range(1960, 2020), growth)
ax.set_ylabel("GDP growth rate (%)")
plt.show()
```

:::{figure} #native-plot-fig-1
:label: native_gdp
A simulated growth series (GDP growth rate %)
:::

The figure is numbered and can be referred to: {numref}`native_gdp`.

## A second one, to check the numbering

```{code-cell} ipython3
:label: native-plot-fig-2
fig, ax = plt.subplots()
ax.hist(np.diff(growth), bins=15)
ax.set_xlabel("change in growth rate")
plt.show()
```

:::{figure} #native-plot-fig-2
:label: native_changes
The distribution of year-on-year changes
:::

{numref}`native_changes` follows {numref}`native_gdp` in the page's numbering.
