from app.services.generators.advisory_generator import generate_advisory
from app.services.generators.linkedin_generator import generate_linkedin_post

GENERATORS = {
    "advisory": generate_advisory,
    "linkedin_post": generate_linkedin_post,
}
