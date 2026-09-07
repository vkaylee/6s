DELETE FROM tags
WHERE code IN (
    'office_document_clutter',
    'obsolete_office_supplies',
    'office_desk_disorder',
    'office_cable_clutter',
    'shared_area_items_misplaced',
    'office_dust_accumulation',
    'office_waste_overflow',
    'pantry_cleanliness_issue',
    'missing_office_visual_standard',
    'unorganized_shared_documents',
    'improper_office_waste_sorting',
    'blocked_office_exit',
    'office_trip_hazard',
    'overloaded_office_socket'
);
