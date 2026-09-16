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

(exercises)=
# Exercises and Solutions

```{index} single: Test Corpus; Exercises
```

% Patterns from continuous_time_mcs/ergodicity.md (exercise + solution),
% lecture-python-intro/short_path.md (gated exercise with code cells),
% lecture-dp/career.md (hint dropdown) and lecture-python.myst generally.
% 381 `{exercise}` and 260 gated `{exercise-start}` blocks; 519 gated solutions,
% 509 of them `:class: dropdown`; 150 plain `{solution}` blocks.

```{code-cell} ipython3
:tags: [hide-cell]
import numpy as np
```

## Overview

The series use `sphinx-exercise` in both of its forms. The compact form holds
prose only; the gated form lets code cells sit between the start and end
markers so that `myst-nb` executes them. Solutions are almost always folded
behind a dropdown.

## Compact exercises

```{exercise}
:label: ergodicity-ex-1
Let $(P_t)$ be a Markov semigroup. True or false:
for this semigroup, every state $x$ is accessible from itself.
```

```{solution} ergodicity-ex-1
:class: dropdown

The statement is true. With $t=0$ we have $P_t(x,x) = I(x,x) = 1 > 0$.
```

A solution that is not folded (60 of the 150 compact solutions):

```{exercise}
:label: corpus-ex-plain
Show that $\sum_{t=0}^\infty \beta^t = 1 / (1 - \beta)$ for $\beta \in (0, 1)$.
```

```{solution} corpus-ex-plain
Multiply the partial sum $S_T = \sum_{t=0}^T \beta^t$ by $\beta$ and subtract:
$S_T (1 - \beta) = 1 - \beta^{T+1} \to 1$.
```

A titled exercise:

```{exercise} A titled exercise
:label: corpus-ex-titled
Exercises may carry a title as their argument.
```

## Gated exercises with code

```{exercise-start}
:label: short_path_ex1
```

The text below describes a weighted directed graph. The line
`node0, node1 0.04, node8 11.11` means that from node0 we can go to node1 at
cost 0.04 and to node8 at cost 11.11.

```{note}
You will be dealing with floating point numbers now, rather than
integers, so consider replacing `np.equal()` with `np.allclose()`.
```

```{code-cell} python3
%%file graph.txt
node0, node1 0.04, node8 11.11
node1, node8 20.59, node2 0.5
node2, node8 2.0
node8,
```

Your task is to find the cost of the cheapest path from node0 to node8.

```{exercise-end}
```

```{solution-start} short_path_ex1
:class: dropdown
```

Read the file into a cost matrix and run the Bellman iteration:

```{code-cell} python3
def read_graph(path):
    costs = {}
    with open(path) as f:
        for line in f:
            head, *rest = line.strip().split(",")
            costs[head] = {}
            for item in rest:
                if item.strip():
                    node, cost = item.split()
                    costs[head][node] = float(cost)
    return costs

graph = read_graph("graph.txt")
graph
```

```{code-cell} python3
def shortest_cost(graph, source="node0", target="node8"):
    J = {node: np.inf for node in graph}
    J[target] = 0.0
    while True:
        J_new = J.copy()
        for node, edges in graph.items():
            if edges:
                J_new[node] = min(cost + J[dest] for dest, cost in edges.items())
        if np.allclose(list(J_new.values()), list(J.values())):
            return J_new[source]
        J = J_new

shortest_cost(graph)
```

```{solution-end}
```

A gated solution carrying its own label (nine uses), and a hint folded into
the exercise:

```{exercise-start} Evolution of the value function
:label: corpus-ex-gated-2
```

Iterate the Bellman operator $T v = \max\{ w, c + \beta \, v \}$ from $v_0 = 0$
and report the fixed point.

```{hint}
:class: dropdown
Iterate until `np.abs(v_new - v) < 1e-8`.
```

```{exercise-end}
```

```{solution-start} corpus-ex-gated-2
:class: dropdown
:label: corpus-ex-gated-2-sol
```

```{code-cell} python3
w, c, beta = 1.0, 0.5, 0.9
v = 0.0
for _ in range(1_000):
    v_new = max(w, c + beta * v)
    if abs(v_new - v) < 1e-8:
        break
    v = v_new
v_new
```

```{seealso}
The same iteration, with a Markov state, is the McCall model of the
dynamic-programming lectures.
```

```{solution-end}
```

## Referring to exercises

Exercises are referenced with `{ref}`: {ref}`short_path_ex1` and
{ref}`the compact one <ergodicity-ex-1>`.
