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

(proofs)=
# Theorems, Definitions and Proofs

```{index} single: Test Corpus; Proofs
```

% Patterns from continuous_time_mcs (theorem, lemma, proof, algorithm),
% lecture-python-intro/inequality.md (definition, example),
% lecture-python-advanced.myst (proposition, assumption, corollary) and
% lecture-python-intro/eigen_II.md (the capitalised prf:Theorem).
% 253 `prf:*` blocks across seven kinds; 253 `{prf:ref}` roles.

## Definitions and examples

```{prf:definition} Markov kernel
:label: def-markov-kernel

A **Markov kernel** on $S$ is a function $P \colon S \times S \to [0, 1]$
with $\sum_{y \in S} P(x, y) = 1$ for every $x \in S$.
```

```{prf:example}
:label: ie_ex_av

Imagine two societies, each with one million people, where

* in the first society, the yearly income of one man is $100,000,000 and the income of the others are zero
* in the second society, the yearly income of everyone is $100

The two societies have the same mean but very different distributions.
```

```{prf:example} Gaussian random walk
:label: corpus-ex-rw
:class: dropdown

An example folded behind a dropdown (one use in the series).
```

## Theorems and their kin

```{prf:theorem} Neumann Series Lemma
:label: thm-neumann

Let $A$ be a square matrix and let $A^k$ be the $k$-th power of $A$.
If $r(A) < 1$ then $I - A$ is invertible and

$$
(I - A)^{-1} = \sum_{k=0}^{\infty} A^k
$$
```

```{prf:proof}
Since $r(A) < 1$, the series converges and $(I - A) \sum_{k=0}^{K} A^k = I - A^{K+1} \to I$.
```

```{prf:lemma} Strict Contractivity
:label: lem-contraction

If $\beta \in (0, 1)$ then $T$ is a contraction of modulus $\beta$.
```

```{prf:proposition} Self-generation
:label: prop-self-generation

Every self-generating set is a subset of the equilibrium value set.
```

```{prf:assumption} Preferences
:label: assump-preferences

Utility is strictly increasing, strictly concave and bounded.
```

```{prf:corollary}
:label: cor-unique

The fixed point of $T$ is unique.
```

```{prf:remark}
:label: rem-sharp

The bound in {prf:ref}`lem-contraction` is sharp.
```

```{prf:property} Mean preservation
:label: prop-mean-preservation

The operator preserves the mean of the distribution it acts on.
```

A proof with an argument, the `(Sketch)` form used in the advanced lectures:

```{prf:proof} (Sketch)
Apply {prf:ref}`thm-neumann` to $\beta P$.
```

## Algorithms

```{prf:algorithm} Jump Chain Algorithm
:label: ejc_algo

**Inputs** $\psi \in \dD$, rate function $\lambda$, Markov matrix $K$

**Outputs** Markov chain $(X_t)$

1. Draw $Y_0$ from $\psi$, set $J_0 = 0$ and $k=1$.
1. Draw $W_k$ independently from $\Exp(\lambda(Y_{k-1}))$.
1. Set $J_k = J_{k-1} + W_k$.
1. Set $X_t = Y_{k-1}$ for $t$ in $[J_{k-1}, J_k)$.
1. Draw $Y_k$ from $K(Y_{k-1}, \cdot)$.
1. Set $k = k+1$ and go to step 2.
```

## References to proof blocks

`{prf:ref}` renders the kind and number: {prf:ref}`def-markov-kernel`,
{prf:ref}`thm-neumann`, {prf:ref}`ejc_algo`, and with explicit text
{prf:ref}`the contraction lemma <lem-contraction>`.

## A capitalised directive name

Two series write `{prf:Theorem}` with a capital T (nine uses). Sphinx accepts
it; mystmd registers only the lowercase name.

```{prf:Theorem} Perron-Frobenius Theorem
:label: perron-frobenius

If a matrix $A \geq 0$ then there exists a real eigenvalue $r(A) \geq 0$ with
a nonnegative eigenvector.
```
