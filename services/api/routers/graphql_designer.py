"""
GraphQL Message Type Designer Router
Admin endpoints for designing and managing GraphQL message types for Lens Protocol integration.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from uuid import UUID

from database import get_db
from models import GraphQLMessageType, GraphQLMessageTemplate, User
from dependencies import require_admin

router = APIRouter()


# ── Pydantic Models ──

class GraphQLMessageTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type_definition: str
    fields: List[Dict[str, Any]]
    query_template: Optional[str] = None
    mutation_template: Optional[str] = None
    lens_metadata_type: Optional[str] = None
    metadata_attributes: Optional[Dict[str, Any]] = None


class GraphQLMessageTypeUpdate(BaseModel):
    description: Optional[str] = None
    type_definition: Optional[str] = None
    fields: Optional[List[Dict[str, Any]]] = None
    query_template: Optional[str] = None
    mutation_template: Optional[str] = None
    lens_metadata_type: Optional[str] = None
    metadata_attributes: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class GraphQLMessageTemplateCreate(BaseModel):
    message_type_id: UUID
    template_name: str
    template_content: str
    variables_schema: Optional[Dict[str, Any]] = None


class GraphQLMessageTemplateUpdate(BaseModel):
    template_name: Optional[str] = None
    template_content: Optional[str] = None
    variables_schema: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


# ── GraphQL Message Type Endpoints ──

@router.get("/graphql/types")
async def list_graphql_message_types(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all GraphQL message types."""
    result = await db.execute(
        select(GraphQLMessageType).order_by(GraphQLMessageType.created_at.desc())
    )
    types = result.scalars().all()
    
    return [
        {
            "id": str(t.id),
            "name": t.name,
            "description": t.description,
            "type_definition": t.type_definition,
            "fields": t.fields,
            "lens_metadata_type": t.lens_metadata_type,
            "is_active": t.is_active,
            "is_system": t.is_system,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat(),
        }
        for t in types
    ]


@router.get("/graphql/types/{type_id}")
async def get_graphql_message_type(
    type_id: UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific GraphQL message type."""
    result = await db.execute(
        select(GraphQLMessageType).where(GraphQLMessageType.id == type_id)
    )
    message_type = result.scalar_one_or_none()
    
    if not message_type:
        raise HTTPException(status_code=404, detail="Message type not found")
    
    return {
        "id": str(message_type.id),
        "name": message_type.name,
        "description": message_type.description,
        "type_definition": message_type.type_definition,
        "fields": message_type.fields,
        "query_template": message_type.query_template,
        "mutation_template": message_type.mutation_template,
        "lens_metadata_type": message_type.lens_metadata_type,
        "metadata_attributes": message_type.metadata_attributes,
        "is_active": message_type.is_active,
        "is_system": message_type.is_system,
        "created_by": str(message_type.created_by) if message_type.created_by else None,
        "created_at": message_type.created_at.isoformat(),
        "updated_at": message_type.updated_at.isoformat(),
    }


@router.post("/graphql/types")
async def create_graphql_message_type(
    req: GraphQLMessageTypeCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new GraphQL message type."""
    # Check if name already exists
    existing = await db.execute(
        select(GraphQLMessageType).where(GraphQLMessageType.name == req.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Message type with this name already exists")
    
    message_type = GraphQLMessageType(
        name=req.name,
        description=req.description,
        type_definition=req.type_definition,
        fields=req.fields,
        query_template=req.query_template,
        mutation_template=req.mutation_template,
        lens_metadata_type=req.lens_metadata_type,
        metadata_attributes=req.metadata_attributes,
        created_by=user.id,
    )
    
    db.add(message_type)
    await db.commit()
    await db.refresh(message_type)
    
    return {
        "id": str(message_type.id),
        "name": message_type.name,
        "message": "GraphQL message type created successfully"
    }


@router.patch("/graphql/types/{type_id}")
async def update_graphql_message_type(
    type_id: UUID,
    req: GraphQLMessageTypeUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a GraphQL message type."""
    result = await db.execute(
        select(GraphQLMessageType).where(GraphQLMessageType.id == type_id)
    )
    message_type = result.scalar_one_or_none()
    
    if not message_type:
        raise HTTPException(status_code=404, detail="Message type not found")
    
    if message_type.is_system:
        raise HTTPException(status_code=403, detail="Cannot modify system message types")
    
    # Update fields
    update_data = req.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(message_type, field, value)
    
    await db.commit()
    await db.refresh(message_type)
    
    return {
        "id": str(message_type.id),
        "name": message_type.name,
        "message": "GraphQL message type updated successfully"
    }


@router.delete("/graphql/types/{type_id}")
async def delete_graphql_message_type(
    type_id: UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a GraphQL message type."""
    result = await db.execute(
        select(GraphQLMessageType).where(GraphQLMessageType.id == type_id)
    )
    message_type = result.scalar_one_or_none()
    
    if not message_type:
        raise HTTPException(status_code=404, detail="Message type not found")
    
    if message_type.is_system:
        raise HTTPException(status_code=403, detail="Cannot delete system message types")
    
    await db.delete(message_type)
    await db.commit()
    
    return {"message": "GraphQL message type deleted successfully"}


# ── GraphQL Message Template Endpoints ──

@router.get("/graphql/templates")
async def list_graphql_message_templates(
    message_type_id: Optional[UUID] = None,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all GraphQL message templates."""
    query = select(GraphQLMessageTemplate).order_by(GraphQLMessageTemplate.created_at.desc())
    
    if message_type_id:
        query = query.where(GraphQLMessageTemplate.message_type_id == message_type_id)
    
    result = await db.execute(query)
    templates = result.scalars().all()
    
    return [
        {
            "id": str(t.id),
            "message_type_id": str(t.message_type_id),
            "template_name": t.template_name,
            "template_content": t.template_content,
            "variables_schema": t.variables_schema,
            "usage_count": t.usage_count,
            "is_active": t.is_active,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat(),
        }
        for t in templates
    ]


@router.get("/graphql/templates/{template_id}")
async def get_graphql_message_template(
    template_id: UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific GraphQL message template."""
    result = await db.execute(
        select(GraphQLMessageTemplate).where(GraphQLMessageTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    return {
        "id": str(template.id),
        "message_type_id": str(template.message_type_id),
        "template_name": template.template_name,
        "template_content": template.template_content,
        "variables_schema": template.variables_schema,
        "usage_count": template.usage_count,
        "is_active": template.is_active,
        "created_by": str(template.created_by) if template.created_by else None,
        "created_at": template.created_at.isoformat(),
        "updated_at": template.updated_at.isoformat(),
    }


@router.post("/graphql/templates")
async def create_graphql_message_template(
    req: GraphQLMessageTemplateCreate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Create a new GraphQL message template."""
    # Verify message type exists
    type_result = await db.execute(
        select(GraphQLMessageType).where(GraphQLMessageType.id == req.message_type_id)
    )
    if not type_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Message type not found")
    
    template = GraphQLMessageTemplate(
        message_type_id=req.message_type_id,
        template_name=req.template_name,
        template_content=req.template_content,
        variables_schema=req.variables_schema,
        created_by=user.id,
    )
    
    db.add(template)
    await db.commit()
    await db.refresh(template)
    
    return {
        "id": str(template.id),
        "template_name": template.template_name,
        "message": "GraphQL message template created successfully"
    }


@router.patch("/graphql/templates/{template_id}")
async def update_graphql_message_template(
    template_id: UUID,
    req: GraphQLMessageTemplateUpdate,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Update a GraphQL message template."""
    result = await db.execute(
        select(GraphQLMessageTemplate).where(GraphQLMessageTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Update fields
    update_data = req.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)
    
    await db.commit()
    await db.refresh(template)
    
    return {
        "id": str(template.id),
        "template_name": template.template_name,
        "message": "GraphQL message template updated successfully"
    }


@router.delete("/graphql/templates/{template_id}")
async def delete_graphql_message_template(
    template_id: UUID,
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Delete a GraphQL message template."""
    result = await db.execute(
        select(GraphQLMessageTemplate).where(GraphQLMessageTemplate.id == template_id)
    )
    template = result.scalar_one_or_none()
    
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    await db.delete(template)
    await db.commit()
    
    return {"message": "GraphQL message template deleted successfully"}


# ── System Message Types Seeding ──

@router.post("/graphql/seed-system-types")
async def seed_system_message_types(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Seed system-defined GraphQL message types for Lens Protocol."""
    system_types = [
        {
            "name": "LensProfile",
            "description": "Lens Protocol v3 Profile metadata",
            "type_definition": """
                type LensProfile {
                    version: String!
                    name: String!
                    bio: String
                    locale: String
                    picture: Picture
                    coverPicture: Picture
                    attributes: [Attribute]
                }
                
                type Picture {
                    raw: Media
                }
                
                type Media {
                    uri: String!
                    mimeType: String
                }
                
                type Attribute {
                    key: String!
                    value: String!
                }
            """,
            "fields": [
                {"name": "version", "type": "String", "required": True},
                {"name": "name", "type": "String", "required": True},
                {"name": "bio", "type": "String", "required": False},
                {"name": "locale", "type": "String", "required": True},
                {"name": "picture", "type": "Picture", "required": False},
                {"name": "coverPicture", "type": "Picture", "required": False},
                {"name": "attributes", "type": "[Attribute]", "required": False},
            ],
            "lens_metadata_type": "PROFILE",
            "metadata_attributes": {
                "app": "OnTrail",
                "type": "Profile"
            },
            "is_system": True,
        },
        {
            "name": "LensPost",
            "description": "Lens Protocol v3 Post metadata",
            "type_definition": """
                type LensPost {
                    version: String!
                    content: String!
                    locale: String
                    media: [Media]
                    attributes: [Attribute]
                }
                
                type Media {
                    item: String!
                    type: String!
                    cover: Boolean
                }
                
                type Attribute {
                    key: String!
                    value: String!
                }
            """,
            "fields": [
                {"name": "version", "type": "String", "required": True},
                {"name": "content", "type": "String", "required": True},
                {"name": "locale", "type": "String", "required": True},
                {"name": "media", "type": "[Media]", "required": False},
                {"name": "attributes", "type": "[Attribute]", "required": False},
            ],
            "lens_metadata_type": "POST",
            "metadata_attributes": {
                "app": "OnTrail",
                "type": "Post"
            },
            "is_system": True,
        },
        {
            "name": "OnTrailPOI",
            "description": "OnTrail POI metadata for Lens Protocol",
            "type_definition": """
                type OnTrailPOI {
                    version: String!
                    name: String!
                    description: String
                    locale: String
                    attributes: [Attribute]
                    location: Location
                }
                
                type Attribute {
                    key: String!
                    value: String!
                }
                
                type Location {
                    latitude: Float!
                    longitude: Float!
                }
            """,
            "fields": [
                {"name": "version", "type": "String", "required": True},
                {"name": "name", "type": "String", "required": True},
                {"name": "description", "type": "String", "required": False},
                {"name": "locale", "type": "String", "required": True},
                {"name": "attributes", "type": "[Attribute]", "required": False},
                {"name": "location", "type": "Location", "required": True},
            ],
            "lens_metadata_type": "POST",
            "metadata_attributes": {
                "app": "OnTrail",
                "type": "POI",
                "rarity": "common"
            },
            "is_system": True,
        },
    ]
    
    created_count = 0
    for type_data in system_types:
        existing = await db.execute(
            select(GraphQLMessageType).where(GraphQLMessageType.name == type_data["name"])
        )
        if not existing.scalar_one_or_none():
            message_type = GraphQLMessageType(
                name=type_data["name"],
                description=type_data.get("description"),
                type_definition=type_data["type_definition"],
                fields=type_data["fields"],
                lens_metadata_type=type_data.get("lens_metadata_type"),
                metadata_attributes=type_data.get("metadata_attributes"),
                is_system=type_data.get("is_system", False),
                created_by=user.id,
            )
            db.add(message_type)
            created_count += 1
    
    await db.commit()
    
    return {
        "message": f"Seeded {created_count} system message types",
        "created_count": created_count
    }


# ── DB Schema Browser ──────────────────────────────────────────────────────────

@router.get("/db/schema")
async def get_db_schema(
    user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Return all user tables with their column names and types for the visual field picker."""
    from sqlalchemy import text
    result = await db.execute(text("""
        SELECT
            c.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable,
            c.column_default
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON c.table_name = t.table_name
         AND c.table_schema = t.table_schema
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY c.table_name, c.ordinal_position
    """))
    rows = result.fetchall()

    schema: dict = {}
    for row in rows:
        tbl = row[0]
        if tbl not in schema:
            schema[tbl] = []
        schema[tbl].append({
            "column": row[1],
            "type": row[2],
            "nullable": row[3] == "YES",
            "default": row[4],
        })

    return [{"table": tbl, "columns": cols} for tbl, cols in sorted(schema.items())]
