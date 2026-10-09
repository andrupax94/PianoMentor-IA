# description: Notas correctas, omitidas, adicionales y timing.
# context: Confianza en el evaluador.

from piano_mentor.evaluation import PerformanceEvaluator


def test_evaluator_returns_mvp_shape() -> None:
    result = PerformanceEvaluator().evaluate([], [])
    assert result["status"] == "stub"
    assert result["notes_score"] == 0.0
