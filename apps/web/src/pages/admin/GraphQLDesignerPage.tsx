import React, { useState, useEffect } from 'react';

interface Field {
  name: string;
  type: string;
  required: boolean;
}

interface MessageType {
  id: string;
  name: string;
  description: string;
  type_definition: string;
  fields: Field[];
  lens_metadata_type: string;
  is_active: boolean;
  is_system: boolean;
  created_at: string;
}

interface Template {
  id: string;
  message_type_id: string;
  template_name: string;
  template_content: string;
  variables_schema: any;
  usage_count: number;
  is_active: boolean;
  created_at: string;
}

export default function GraphQLDesignerPage() {
  const [activeTab, setActiveTab] = useState('types');
  const [messageTypes, setMessageTypes] = useState<MessageType[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedType, setSelectedType] = useState<MessageType | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type_definition: '',
    lens_metadata_type: '',
    fields: [] as Field[],
  });
  const [newField, setNewField] = useState<Field>({ name: '', type: 'String', required: false });

  useEffect(() => {
    fetchMessageTypes();
    fetchTemplates();
  }, []);

  const fetchMessageTypes = async () => {
    try {
      const response = await fetch('/api/admin/graphql/types');
      const data = await response.json();
      setMessageTypes(data);
    } catch (error) {
      console.error('Failed to fetch message types:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/admin/graphql/templates');
      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  };

  const handleSeedSystemTypes = async () => {
    try {
      const response = await fetch('/api/admin/graphql/seed-system-types', {
        method: 'POST',
      });
      const data = await response.json();
      alert(data.message);
      fetchMessageTypes();
    } catch (error) {
      console.error('Failed to seed system types:', error);
      alert('Failed to seed system types');
    }
  };

  const handleCreateType = async () => {
    try {
      const response = await fetch('/api/admin/graphql/types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        alert('Message type created successfully');
        setShowCreateModal(false);
        setFormData({ name: '', description: '', type_definition: '', lens_metadata_type: '', fields: [] });
        fetchMessageTypes();
      }
    } catch (error) {
      console.error('Failed to create message type:', error);
      alert('Failed to create message type');
    }
  };

  const addField = () => {
    if (newField.name) {
      setFormData({ ...formData, fields: [...formData.fields, newField] });
      setNewField({ name: '', type: 'String', required: false });
    }
  };

  const removeField = (index: number) => {
    setFormData({
      ...formData,
      fields: formData.fields.filter((_, i) => i !== index),
    });
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">GraphQL Message Type Designer</h1>
        <p className="text-muted-foreground">
          Design and manage GraphQL message types for Lens Protocol integration
        </p>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('types')}
          className={`px-4 py-2 ${activeTab === 'types' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          Message Types
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-4 py-2 ${activeTab === 'templates' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
        >
          Templates
        </button>
      </div>

      {activeTab === 'types' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Message Types</h2>
            <div className="flex gap-2">
              <button
                onClick={handleSeedSystemTypes}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Seed System Types
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create New Type
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            {messageTypes.map((type) => (
              <div key={type.id} className="p-4 border rounded space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{type.name}</h3>
                    <p className="text-sm text-muted-foreground">{type.description}</p>
                    {type.is_system && (
                      <span className="text-xs bg-gray-200 px-2 py-1 rounded">System</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedType(type)}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      View
                    </button>
                    {!type.is_system && (
                      <button className="text-sm text-red-600 hover:underline">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
                {type.lens_metadata_type && (
                  <div className="text-xs text-muted-foreground">
                    Lens Type: {type.lens_metadata_type}
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  Fields: {type.fields.length}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Message Templates</h2>
          <div className="grid gap-4">
            {templates.map((template) => (
              <div key={template.id} className="p-4 border rounded space-y-2">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold">{template.template_name}</h3>
                    <div className="text-xs text-muted-foreground">
                      Type ID: {template.message_type_id}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Used {template.usage_count} times
                  </div>
                </div>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                  {template.template_content}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            <h2 className="text-xl font-semibold">Create Message Type</h2>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <input
                type="text"
                className="w-full px-3 py-2 border rounded"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., OnTrailPOI"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <textarea
                className="w-full px-3 py-2 border rounded"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description of this message type"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Lens Metadata Type</label>
              <select
                className="w-full px-3 py-2 border rounded"
                value={formData.lens_metadata_type}
                onChange={(e) => setFormData({ ...formData, lens_metadata_type: e.target.value })}
              >
                <option value="">Select type...</option>
                <option value="PROFILE">PROFILE</option>
                <option value="POST">POST</option>
                <option value="COMMENT">COMMENT</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Fields</label>
              <div className="space-y-2">
                {formData.fields.map((field, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm">{field.name}</span>
                    <span className="text-xs text-muted-foreground">({field.type})</span>
                    {field.required && <span className="text-xs text-red-600">required</span>}
                    <button
                      onClick={() => removeField(index)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 px-3 py-2 border rounded"
                  placeholder="Field name"
                  value={newField.name}
                  onChange={(e) => setNewField({ ...newField, name: e.target.value })}
                />
                <select
                  className="px-3 py-2 border rounded"
                  value={newField.type}
                  onChange={(e) => setNewField({ ...newField, type: e.target.value })}
                >
                  <option value="String">String</option>
                  <option value="Int">Int</option>
                  <option value="Float">Float</option>
                  <option value="Boolean">Boolean</option>
                  <option value="[String]">[String]</option>
                  <option value="JSON">JSON</option>
                </select>
                <label className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={newField.required}
                    onChange={(e) => setNewField({ ...newField, required: e.target.checked })}
                  />
                  Required
                </label>
                <button
                  onClick={addField}
                  className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Type Definition (GraphQL)</label>
              <textarea
                className="w-full px-3 py-2 border rounded font-mono text-xs"
                rows={10}
                value={formData.type_definition}
                onChange={(e) => setFormData({ ...formData, type_definition: e.target.value })}
                placeholder="type TypeName {
  field1: String!
  field2: Int
}"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateType}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="text-xl font-semibold">{selectedType.name}</h2>
              <button
                onClick={() => setSelectedType(null)}
                className="text-gray-600 hover:text-gray-800"
              >
                ✕
              </button>
            </div>
            
            <p className="text-sm text-muted-foreground">{selectedType.description}</p>
            
            {selectedType.lens_metadata_type && (
              <div className="p-3 bg-blue-50 rounded">
                <div className="text-sm font-medium">Lens Metadata Type</div>
                <div className="text-sm">{selectedType.lens_metadata_type}</div>
              </div>
            )}
            
            <div className="space-y-2">
              <h3 className="font-semibold">Fields</h3>
              <div className="grid gap-2">
                {selectedType.fields.map((field, index) => (
                  <div key={index} className="p-2 border rounded flex justify-between items-center">
                    <div>
                      <span className="font-medium">{field.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({field.type})</span>
                    </div>
                    {field.required && <span className="text-xs text-red-600">required</span>}
                  </div>
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold">Type Definition</h3>
              <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-64">
                {selectedType.type_definition}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
