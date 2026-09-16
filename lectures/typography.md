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

(typography)=
# Text and Page Structure

```{index} single: Test Corpus; Typography
```

```{contents} Contents
:depth: 2
```

% Patterns from lecture-python-programming/about_py.md (epigraph, index),
% lecture-dp/career.md (contents directive) and lecture-python.myst generally.

## Overview

```{epigraph}
"Python has gotten sufficiently weapons grade that we don't descend into R
anymore. Sorry, R people. I used to be one of you but we no longer descend
into R." -- Chris Wiggins
```

This page holds the prose-level syntax: headings to depth five, inline
formatting, lists, block quotes, tables, block breaks, comments, inline HTML
and conditional content. Every lecture page starts the way this one does: a
target label, the notebook logo header in a `{raw}` block, the title, an
`{index}` entry and -- in three of the series -- a `{contents}` directive.

## Headings

Lectures nest headings to `####` in 88 files and to `#####` in one.

### A third-level heading

Text under the third level, with *emphasis*, **strong emphasis**, `inline code`
and ***both***.

#### A fourth-level heading

Fourth-level headings appear in the "On this page" outline of the Sphinx sites.

##### A fifth-level heading

The deepest heading level in use (`lecture-python.myst/lectures/multi_hyper.md`).

## Inline formatting

Smart quotes turn "double" and 'single' quotes into typographic ones, and the
`replacements` extension turns -- and --- into dashes, (c) into a symbol and
1/2 into a fraction. Links come in four forms: an [external link](https://quantecon.org),
an autolink <https://python.quantecon.org/>, a bare URL that `linkify` picks
up, https://intro.quantecon.org/, and the cross-reference roles collected on
the {doc}`references` page.

A footnote reference[^footnote-1] and a second one[^footnote-2] sit here; their
definitions are at the end of the section.

[^footnote-1]: The first footnote. Lectures carry 43 footnote definitions across
    16 files, most of them in the advanced series.

[^footnote-2]: A second footnote, with maths: $\int_0^1 x \, dx = 1/2$.

## Lists

Bullet lists, nested:

* Economics (sequential decision making, analysis of social networks, etc.)
* Operations research and transportation
    * a nested item
    * another nested item, with `code` and $
* Robotics and artificial intelligence

Numbered lists written with a repeated `1.` marker, which is how the
algorithm blocks are written:

1. Draw $ from $\psi$, set  = 0$ and =1$.
1. Draw $ independently from $\Exp(\lambda(Y_{k-1}))$.
1. Set  = J_{k-1} + W_k$.

A definition list (the `deflist` extension; three uses in the series):

Markov kernel
: A function  \colon S \times S \to [0, 1]$ with $\sum_y P(x, y) = 1$ for every $.

Stationary distribution
: A distribution $\psi$ with $\psi P = \psi$.

## Block quotes

> The shortest path problem is one of finding how to traverse a graph from one
> specified node to another at minimum cost.

A block quote carrying display maths, as `black_litterman.md` does:

> **Remark:** More generally there is a class of density functions
> that possesses this feature, i.e.
>
> 5009
  \exists g: \mathbb{R}_+ \mapsto \mathbb{R}_+ \ \ \text{ and } \ \ c \geq 0,
  \ \ \text{s.t. the density } \ \ f \ \ \text{of} \ \ Z \   \text{ has the form } \quad f(z) = c g(z\cdot z)
  5009
>
> This property is called **spherical symmetry**.

## Tables

Pipe tables appear in 43 files, often with maths in the cells:

| Symbol   | Meaning                      | Value |
|:---------|:-----------------------------|------:|
| $\beta$  | discount factor              |  0.96 |
| $      | net interest rate            |  0.05 |
| $\gamma$ | coefficient of risk aversion |   2.0 |

## Block breaks and comments

Jupytext block breaks (`+++`) separate Markdown cells in the notebook export;
340 of them appear across 57 files. One follows this paragraph.

+++

% A MyST comment: it must not render. 27 uses across the series.

<!-- An HTML comment, which must not render either. -->

The paragraph after the block break and the two comments.

## Inline HTML

Inline HTML passes through the Sphinx build unchanged. A centred line:

<center>This line is wrapped in a `<center>` element.</center>

## Conditional content

The `{only}` directive selects content by builder. The HTML build shows the
first block and the LaTeX build the second; on mystmd neither is known
(QuantEcon/mystmd#104).

```{only} html
The treatment given here closely follows <a href=_static/lecture_specific/code/loaded_script.py download>this script</a>,
which the HTML build offers as a download.
```

```{only} latex
The treatment given here closely follows [this script](https://github.com/QuantEcon/test-lecture-theme-sphinx),
which the printed edition links to.
```

## Index entries

Index roles mark terms for the general index: {index}`Markov chain <single: Markov chain>`
and {index}`dynamic programming <single: Dynamic Programming; Overview>`.
