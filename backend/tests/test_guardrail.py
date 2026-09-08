from app.services.guardrail import check_grounding


def test_fully_grounded_output_has_no_flags():
    source = (
        "The Ministry of Home Affairs issued an advisory on 12 September about a "
        "phishing campaign impersonating the State Bank of India."
    )
    generated = (
        "The Ministry of Home Affairs warns of a phishing campaign impersonating "
        "the State Bank of India, reported on 12 September."
    )
    result = check_grounding(source, generated)
    assert result.pass_rate == 1.0
    assert result.flags == []


def test_invented_entity_is_flagged():
    source = "A phishing campaign impersonating a government payment portal has been observed."
    generated = "The Reserve Bank of India confirmed the phishing campaign impersonating a government payment portal."
    result = check_grounding(source, generated)
    claims = [f.claim for f in result.flags]
    assert any("Reserve Bank Of India" in c for c in claims)
    assert result.pass_rate < 1.0


def test_invented_number_is_flagged():
    source = "Several users reported receiving suspicious emails this week."
    generated = "Over 4,500 users were affected by the phishing campaign this week."
    result = check_grounding(source, generated)
    claims = [f.claim for f in result.flags]
    assert "4,500" in claims


def test_empty_generated_text_has_full_pass_rate():
    result = check_grounding("Some source content.", "")
    assert result.pass_rate == 1.0
    assert result.flags == []


def test_grounded_number_from_source_not_flagged():
    source = "The incident affected 4,500 users across 3 states."
    generated = "This affected 4,500 users, spread across 3 states."
    result = check_grounding(source, generated)
    assert result.flags == []
    assert result.pass_rate == 1.0
