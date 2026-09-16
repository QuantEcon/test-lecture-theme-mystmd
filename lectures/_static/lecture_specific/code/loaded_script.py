"""A helper loaded into a lecture cell with `:load:`, as the AMSS and
optimal-taxation lectures load their `_static/lecture_specific/*.py` files."""
import numpy as np


def crra_utility(c, gamma=2.0):
    """Constant relative risk aversion utility."""
    if gamma == 1.0:
        return np.log(c)
    return (c ** (1 - gamma) - 1) / (1 - gamma)


def present_value(payments, r=0.05):
    """Discounted sum of a payment stream at interest rate r."""
    t = np.arange(len(payments))
    return np.sum(np.asarray(payments) / (1 + r) ** t)
