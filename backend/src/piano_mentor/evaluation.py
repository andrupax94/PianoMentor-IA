class PerformanceEvaluator:
    """Evaluador determinista inicial; se completará con matching y timing."""

    def evaluate(self, expected: list[object], received: list[object]) -> dict[str, object]:
        return {
            "notes_score": 0.0,
            "timing_score": 0.0,
            "notes_correct": 0,
            "notes_missed": len(expected),
            "extra_notes": len(received),
            "status": "stub",
        }
