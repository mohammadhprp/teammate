# Find Skills Examples

## Discover a React performance skill

User: "How can I make my React app faster?"

Good agent behavior:

- Recognize that the user may benefit from an existing performance skill.
- Check the skills.sh leaderboard for established React and performance skills.
- Search with `npx skills find react performance` if the leaderboard does not provide a clear match.
- Compare install counts and source reputation before recommending an option.
- Present the skill name, purpose, source, install command, and skills.sh link.

## Find a deployment workflow

User: "Is there a skill that can help me deploy a Docker app to Kubernetes?"

Good agent behavior:

- Identify the domain as DevOps and the task as Docker-to-Kubernetes deployment.
- Search with specific terms such as `npx skills find docker kubernetes deployment`.
- Verify that recommended skills are maintained and come from credible sources.
- Explain what each candidate covers and avoid presenting unverified search results as trusted guidance.

## No suitable skill exists

User: "Find a skill for our internal release process."

Good agent behavior:

- Search for relevant release and workflow skills using the user's terminology.
- State clearly when no suitable existing skill is found.
- Offer to help with the release process directly.
- Suggest `npx skills init internal-release` if the workflow is recurring and worth packaging as a skill.
