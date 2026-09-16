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

(admonitions)=
# Admonitions

```{index} single: Test Corpus; Admonitions
```

% Patterns from lecture-python.myst (note, 158 uses), lecture-dp/ifp_advanced.md
% (include of _admonition/gpu.md), lecture-python-intro/inequality.md (seealso),
% lecture-python-programming (hint dropdown) and lecture-python.myst/qr_decomp.md
% (todo). Notes are by far the most common: 380 across every series.

## The built-in kinds

```{note}
A note. Notes carry lists, maths and code:

* the first point, with $x \in \RR$
* the second point, with `np.allclose()`
```

```{note}
:name: iid_violation
A named note, so it can be referred to: {ref}`the named note <iid_violation>`.
```

```{warning}
A warning (three uses, one series).
```

```{tip}
A tip (four uses).
```

```{hint}
A plain hint.
```

```{hint}
:class: dropdown
A hint folded behind a dropdown, the common form (20 of 25 hints).
```

```{seealso}
The World in Data project has a [graphical exploration of the Lorenz curve and the Gini coefficient](https://ourworldindata.org/what-is-the-gini-coefficient)
```

## Titled admonitions

```{admonition} A caveat about the simplified model solved in this lecture
:class: warning
The model omits the labour-supply margin, so the welfare numbers below are
upper bounds.
```

```{admonition} The moral for innovation accounting
:class: note
Measured productivity growth includes the effect of reallocation.
```

```{admonition} Definition
:class: tip
An admonition used as a definition, before `sphinx-proof` was adopted.
```

## Shared admonitions by `include`

Four series keep a GPU notice in `_admonition/gpu.md` and pull it into every
JAX lecture with `{include}` (67 uses):

```{include} _admonition/gpu.md
```

## Epigraphs

```{epigraph}
"Questioning a McCall worker is like having a conversation with an out-of-work friend:
'Maybe you are setting your sights too high', or 'Why did you quit your old job before you
had a new one lined up?' This is real social science." -- Robert E. Lucas, Jr.
```

## Nested admonitions

An admonition inside an exercise keeps the outer size on the mystmd theme; on
the Sphinx sites both step down. The nesting itself is on the {doc}`exercises`
page; here is a note inside a note:

````{note}
The outer note.

```{warning}
An inner warning.
```
````

## Maintainer notes

Two lectures carry `{todo}` blocks. `sphinx.ext.todo` is loaded with
`todo_include_todos` unset, so readers of the Sphinx sites never see them;
mystmd has no `todo` directive.

```{todo}
@mmcky to migrate this to use sphinx-proof
```
