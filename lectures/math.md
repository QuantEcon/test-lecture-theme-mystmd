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

(math)=
# Mathematics

```{index} single: Test Corpus; Mathematics
```

% Patterns from lecture-python-intro/lp_intro.md and cagan_ree.md,
% lecture-dp/amss.md, lecture-python.myst/likelihood_var.md and
% continuous_time_mcs/ergodicity.md. The lectures carry 50,846 inline and
% 9,085 display blocks, 3,010 of them labelled.

## Inline and display maths

Inline maths is the most common construct of all: $x_t$, $\beta \in (0, 1)$,
$\sum_{t=0}^\infty \beta^t u(c_t)$ and $\| \psi Q \| \leq \| Q - D_t \|$.

An unlabelled display block:

$$
    \psi e^{tQ} = \psi + t \psi Q + t^2 \frac{\psi Q^2}{2!} + \cdots
$$

A labelled block, written with the label after the closing fence, and a
reference to it with the `{eq}` role (4,271 uses):

$$
m_{t+1} - p_t = -\alpha (p_{t+1} - p_t)
$$ (eq:cagan_demand)

Equation {eq}`eq:cagan_demand` is the Cagan demand for money.

The `{math}` directive with a `:label:` option is the other labelled form
(1,927 uses, 1,845 of them labelled):

```{math}
:label: feas1_amss

n_t(s^t) + \ell_t(s^t) = 1
```

The feasibility constraint {eq}`feas1_amss` holds state by state.

### Numbers written as inline maths

% lecture-wasm/geom_series.md @ 669c65fb (the interval) and lecture-python.myst generally (the
% exponents): about 1,200 of the lectures' 47,000 inline expressions are a number on its own, 61 of
% them negative. mystmd's inlineMathSimplificationPlugin rewrites those out of the AST -- a bare number
% becomes plain text, a number with a numeric script a span -- so they are set in the prose face, and a
% leading minus sign is written as a hyphen (QuantEcon/mystmd#127). MathJax sets them all as maths.
% This paragraph puts the four cases side by side, for a paired crop (QuantEcon/project-theme-parity#8).
To start, let $c$ be a real number that lies strictly between $-1$ and $1$; we
often write this as $c \in (-1, 1)$. A number on its own, $2.5$, and the same
number inside a formula, $x_1 = 2.5$. A negative number on its own, $-0.5$, and
inside a formula, $x_2 = -0.5$. A tolerance of $10^{-6}$, and the same power
inside a formula, $\epsilon = 10^{-6}$.

The same pairs aligned, for a closer look at the digits and the minus sign:

| On its own | Inside a formula |
| --- | --- |
| $1$ | $c < 1$ |
| $-1$ | $c > -1$ |
| $2.5$ | $x_1 = 2.5$ |
| $-0.5$ | $x_2 = -0.5$ |
| $10^{-6}$ | $\epsilon = 10^{-6}$ |

## Environments

Aligned equations:

$$
\begin{aligned}
\max_{x_1,x_2} \ & z = 3 x_1 + 4 x_2 \\
\text{subject to } \ & 2 x_1 + 5 x_2 \le 30 \\
& 4 x_1 + 2 x_2 \le 20 \\
& x_1, x_2 \ge 0
\end{aligned}
$$

Matrices in `bmatrix` (1,416 uses), `pmatrix`, `matrix` and `array`:

$$
A = \begin{bmatrix} 0.7 & 0.2 \\ 0.1 & 0.6 \end{bmatrix}, \quad
B = \begin{pmatrix} 1 & 0 \\ 0 & 1 \end{pmatrix}, \quad
C = \begin{matrix} a & b \\ c & d \end{matrix}, \quad
D = \left[ \begin{array}{cc} 1 & 2 \\ 3 & 4 \end{array} \right]
$$

A `cases` environment and a `split`:

$$
u(c) = \begin{cases}
\dfrac{c^{1-\gamma} - 1}{1 - \gamma} & \text{if } \gamma \neq 1 \\
\log c & \text{if } \gamma = 1
\end{cases}
$$

$$
\begin{split}
V(x) & = \max_{a \in A(x)} \left\{ r(x, a) + \beta \sum_{x'} V(x') P(x, a, x') \right\} \\
     & = \max_{a \in A(x)} \left\{ r(x, a) + \beta \, \EE_a V(X') \right\}
\end{split}
$$

Bare `amsmath` environments outside `$$`, which the `amsmath` extension parses
(25 uses across five files):

\begin{align*}
y_{t+1} & = \rho y_t + \sigma \epsilon_{t+1} \\
\epsilon_{t+1} & \sim N(0, 1)
\end{align*}

\begin{equation}
c_t + k_{t+1} = f(k_t)
\end{equation}

Three environments with a single lecture use each. A bare, numbered `align`
and a bare `equation*`, the second one set off by `%` comment lines as its
lecture writes it:

% lecture-python.myst/divergence_measures.md @ 4f8bcd60, shortened.
\begin{align}
D_{KL}(f \parallel g) &= \sum_{i} f_i \log\left[\frac{f_i}{g_i}\right] \\
&= \sum_{i} f_i \log f_i - \sum_{i} f_i \log g_i \\
&= H(f,g) - H(f)
\end{align}

% lecture-jax/hopenhayn.md @ 5740d797.
A stationary recursive equilibrium is a triple
%
\begin{equation*}
    (p, M, \mu) \quad \text{ in } \quad
    \mathscr E := (0, \infty) \times (0, \infty) \times \mathscr M,
\end{equation*}
%
with $p$ understood as price and $M$ as the mass of entrants.

And `gathered` inside `$$`, which centres each line rather than aligning them:

% lecture-python.myst/two_computation.md @ 4f8bcd60, shortened.
$$
\begin{gathered}
T_t(P)=P+\sigma P C_t\left(I-\sigma C_t^{\prime} P C_t\right)^{-1} C_t^{\prime} P \\
\mathcal{S}_t(k, P)=\beta_t k-\left(\beta_t / \sigma\right) \log \operatorname{det}\left(I-\sigma C_t^{\prime} P C_t\right)
\end{gathered}
$$

## Macros

The Sphinx theme injects a macro set when `mathjax_path` points at MathJax 3,
and each lecture config may add its own. From the theme's set:
$\EE[X_t] \in \RR$, $\PP(A) \geq 0$, $n \in \NN$, $z \in \ZZ$,
$\argmax_{a} r(x, a)$, $\argmin_{a} c(a)$ and the lunate-versus-standard
epsilon, $\epsilon$ (which the macro maps to $\varepsilon$).

From this site's own `mathjax3_config` only: $\Exp(\lambda)$, $\linop$ and
$\psi \in \dD$.

## TeX commands MathJax accepts

The lectures use TeX commands that MathJax renders and other engines may not.
A `\tag`, `\cr` row separators, `\check`, `\mathscr`, `\colon`, `\middle`,
`\bigm`, `\hbox` and the old-style font switches:

$$
x_{t+1} = A x_t + B u_t \tag{LQ}
$$

$$
\begin{pmatrix} 1 \cr 2 \cr 3 \end{pmatrix}, \quad
\check{x} = \hat{x} - \bar{x}, \quad
\mathscr{F} \colon X \to Y, \quad
\left( \frac{a}{b} \middle| c \right), \quad
\| f \bigm| g \|, \quad
\hbox{a box}, \quad {\rm Var}(x), \quad {\cal A}, \quad {\bf v}
$$

## Syntax that MathJax tolerates

Five constructions appear in the sources that MathJax renders but a stricter
engine rejects. Each of the blocks below fails in KaTeX 0.16 (measured
2026-09-16 over every display block in the eight repositories: 36 failures of
9,085, 29 of them `\mbox`).

`\mbox` (29 uses, `lp_intro.md` and `opt_transport.md`):

$$
\begin{aligned}
\max_{x_1,x_2} \ & z = 3 x_1 + 4 x_2 \\
\mbox{subject to } \ & 2 x_1 + 5 x_2 \le 30 \\
& 4 x_1 + 2 x_2 \le 20 \\
& x_1, x_2 \ge 0 \\
\end{aligned}
$$

A `\label` inside a `$$` block (`ifp_advanced.md`):

$$
\mathbb E \, Y_t < \infty \text{ and } \mathbb E \, u'(Y_t) < \infty
\label{a:y0}
$$

A trailing backslash (`ar1_turningpts.md`, `cass_koopmans_2.md`):

$$
f(y_{t+1} | y_{t}; \rho, \sigma) \sim {\mathcal N}(\rho y_{t}, \sigma^2) \
$$ (ar1-tp-eq2)

An alignment `&` outside any environment (`likelihood_var.md`):

$$
A_f & = \begin{bmatrix} 0.7 & 0.2 \\ 0.1 & 0.6 \end{bmatrix}, \quad C_f = \begin{bmatrix} 0.3 & 0.1 \\ 0.1 & 0.3 \end{bmatrix}
$$

Currency written inside inline maths (`lp_intro.md`): a mutual fund has
$ \$ 100,000$ to invest, and no more than $ \$ $50,000 of it in the bond.
