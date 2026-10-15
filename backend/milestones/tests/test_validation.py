"""Unit tests for the shared milestone date rules."""

import os
import sys
from datetime import date

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=wrong-import-position
from shared.validation import milestone_date_errors

PROJECT = {"start_date": date(2026, 7, 1), "end_date": date(2026, 12, 31)}
UNDATED_PROJECT = {"start_date": None, "end_date": None}


@pytest.mark.parametrize("start,end", [
    (date(2026, 7, 1), date(2026, 12, 31)),   # exactly the project span
    (date(2026, 8, 1), date(2026, 9, 1)),
    (None, None),
    (date(2026, 8, 1), None),
    (None, date(2026, 9, 1)),
])
def test_dates_inside_the_project_are_fine(start, end):
    assert milestone_date_errors(PROJECT, start, end) == {}


@pytest.mark.parametrize("start,end,bad_fields", [
    (date(2026, 6, 30), date(2026, 8, 1), {"startDate"}),
    (date(2026, 12, 1), date(2027, 1, 1), {"endDate"}),
    (date(2027, 1, 1), date(2027, 2, 1), {"startDate", "endDate"}),
    (None, date(2026, 6, 1), {"endDate"}),            # ends before the project starts
    (date(2026, 9, 1), date(2026, 8, 1), {"endDate"}),  # ends before it starts
])
def test_dates_outside_the_project_name_the_field(start, end, bad_fields):
    assert set(milestone_date_errors(PROJECT, start, end)) == bad_fields


def test_messages_quote_the_project_dates():
    errors = milestone_date_errors(PROJECT, date(2026, 6, 1), date(2027, 1, 1))
    assert errors == {"startDate": "Can't be before the project starts (2026-07-01)",
                      "endDate": "Can't be after the project ends (2026-12-31)"}


def test_project_without_dates_imposes_no_bound():
    assert milestone_date_errors(UNDATED_PROJECT, date(2020, 1, 1), date(2030, 1, 1)) == {}
