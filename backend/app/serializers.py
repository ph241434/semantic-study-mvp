from . import models, schemas


def relationship_read(relationship: models.Relationship) -> schemas.RelationshipRead:
    return schemas.RelationshipRead.model_validate(relationship).model_copy(
        update={
            "source_name": relationship.source.name if relationship.source else None,
            "target_name": relationship.target.name if relationship.target else None,
        }
    )

