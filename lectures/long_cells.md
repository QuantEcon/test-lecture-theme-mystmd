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

(long_cells)=
# Long Cells

```{index} single: Test Corpus; Long Cells
```

% The demonstration page for the policy decision QuantEcon/project-theme-parity#19:
% one reader mechanism for long code inputs and long outputs, or two.
% The long input is adapted from lecture-dp/amss.md @ da83d88d, its first
% `collapse-20` cell (the interpolation helpers), with the `@njit` decorators
% removed so the page needs no numba. The long output is the 60-line loop the
% Code Cells page already uses for the scroll tags.
% The tag spellings are the ones the theme prototype reads
% (QuantEcon/quantecon-theme.mystmd#242); `collapse-output-20` is prototype-only.

## Overview

The lectures cap a long cell in two ways. `collapse-N` caps the code *input*
at N em behind an Expand / Collapse bar (21 cells, the dynamic-programming
lectures). `scroll-output`, with its older spelling `output_scroll`, caps the
*output* with a scrollbar (23 cells).

This page shows the same long input and the same long output four ways, so
the two mechanisms can be judged side by side on both stacks. Each cell is
captioned with the mechanism it asks for.

```{code-cell} ipython3
import numpy as np
```

## A long input

### 1. Input capped with an Expand / Collapse bar: `collapse-20`

The tag in use today. The input should show 20 em of code and a bar to expand it.

```{code-cell} ipython3
:tags: [collapse-20]

def get_grid_nodes(grid):
    """
    Get the actual grid points from a grid tuple.
    """
    x_min, x_max, x_num = grid
    return np.linspace(x_min, x_max, x_num)

def linear_interp_1d_scalar(x_min, x_max, x_num, y_values, x_val):
    """Helper function for scalar interpolation"""
    x_nodes = np.linspace(x_min, x_max, x_num)

    # Extrapolation with linear extension
    if x_val <= x_nodes[0]:
        # Linear extrapolation using first two points
        if x_num >= 2:
            slope = (y_values[1] - y_values[0]) \
              / (x_nodes[1] - x_nodes[0])
            return y_values[0] + slope * (x_val - x_nodes[0])
        else:
            return y_values[0]

    if x_val >= x_nodes[-1]:
        # Linear extrapolation using last two points
        if x_num >= 2:
            slope = (y_values[-1] - y_values[-2]) \
              / (x_nodes[-1] - x_nodes[-2])
            return y_values[-1] + slope * (x_val - x_nodes[-1])
        else:
            return y_values[-1]

    # Binary search for the right interval
    left = 0
    right = x_num - 1
    while right - left > 1:
        mid = (left + right) // 2
        if x_nodes[mid] <= x_val:
            left = mid
        else:
            right = mid

    # Linear interpolation
    x_left = x_nodes[left]
    x_right = x_nodes[right]
    y_left = y_values[left]
    y_right = y_values[right]

    weight = (x_val - x_left) / (x_right - x_left)
    return y_left * (1 - weight) + y_right * weight

def linear_interp_1d(x_grid, y_values, x_query):
    """
    Perform 1D linear interpolation.
    """
    x_min, x_max, x_num = x_grid
    return linear_interp_1d_scalar(x_min, x_max, x_num, y_values, x_query[0])
```

### 2. Input capped with a scrollbar: `scroll-input`

The same code. The input should be capped at 24 em with a scrollbar and no bar.

```{code-cell} ipython3
:tags: [scroll-input]

def get_grid_nodes(grid):
    """
    Get the actual grid points from a grid tuple.
    """
    x_min, x_max, x_num = grid
    return np.linspace(x_min, x_max, x_num)

def linear_interp_1d_scalar(x_min, x_max, x_num, y_values, x_val):
    """Helper function for scalar interpolation"""
    x_nodes = np.linspace(x_min, x_max, x_num)

    # Extrapolation with linear extension
    if x_val <= x_nodes[0]:
        # Linear extrapolation using first two points
        if x_num >= 2:
            slope = (y_values[1] - y_values[0]) \
              / (x_nodes[1] - x_nodes[0])
            return y_values[0] + slope * (x_val - x_nodes[0])
        else:
            return y_values[0]

    if x_val >= x_nodes[-1]:
        # Linear extrapolation using last two points
        if x_num >= 2:
            slope = (y_values[-1] - y_values[-2]) \
              / (x_nodes[-1] - x_nodes[-2])
            return y_values[-1] + slope * (x_val - x_nodes[-1])
        else:
            return y_values[-1]

    # Binary search for the right interval
    left = 0
    right = x_num - 1
    while right - left > 1:
        mid = (left + right) // 2
        if x_nodes[mid] <= x_val:
            left = mid
        else:
            right = mid

    # Linear interpolation
    x_left = x_nodes[left]
    x_right = x_nodes[right]
    y_left = y_values[left]
    y_right = y_values[right]

    weight = (x_val - x_left) / (x_right - x_left)
    return y_left * (1 - weight) + y_right * weight

def linear_interp_1d(x_grid, y_values, x_query):
    """
    Perform 1D linear interpolation.
    """
    x_min, x_max, x_num = x_grid
    return linear_interp_1d_scalar(x_min, x_max, x_num, y_values, x_query[0])
```

The helpers work, so the long cells above are real code rather than filler:

```{code-cell} ipython3
grid = (0.0, 1.0, 5)
linear_interp_1d(grid, get_grid_nodes(grid) ** 2, np.array([0.3]))
```

## A long output

### 3. Output capped with a scrollbar: `scroll-output`

The tag in use today. The output should be capped at 24 em with a scrollbar.

```{code-cell} ipython3
:tags: [scroll-output]

for i in range(60):
    print(f"line {i:02d} of a long output: f({i / 59:.3f}) = "
          f"{linear_interp_1d(grid, get_grid_nodes(grid) ** 2, np.array([i / 59])):.5f}")
```

### 4. Output capped with an Expand / Collapse bar: `collapse-output-20`

The same output. It should show 20 em of output and the same bar as cell 1.
This spelling exists only in the theme prototype; no lecture uses it.

```{code-cell} ipython3
:tags: [collapse-output-20]

for i in range(60):
    print(f"line {i:02d} of a long output: f({i / 59:.3f}) = "
          f"{linear_interp_1d(grid, get_grid_nodes(grid) ** 2, np.array([i / 59])):.5f}")
```

## What to look for

- Whether a reader can tell that a capped cell has more in it.
- Whether the full content is one action away, and whether that action is
  reachable from the keyboard.
- Where the page lands after a long cell is collapsed again.
- How each mechanism behaves on a phone, where a scrollbar inside a scrolling
  page competes with the page's own scroll.
