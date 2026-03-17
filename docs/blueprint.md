# **App Name**: EduFlow Platform

## Core Features:

- Secure User Authentication and Access Control: Handles user login, logout, password recovery, persistent sessions, role verification (Superuser, Admin, Profesor, Alumno), status checks (active/inactive), and expiration date validation.
- Academic Structure Management: Allows Superusers to create, edit, and delete hierarchical academic elements such as levels, careers, grades, groups, subjects, units, and topics.
- User Management: Superusers can create, edit, activate, deactivate, and logically delete student, professor, and administrator accounts, including assigning roles, status, and access expiration dates.
- Academic Assignment Management: Enables Superusers to assign professors to specific subjects, groups, and grades, and students to their respective groups and grades.
- Content Creation and Management for Professors: Professors can create, edit, and organize various content types (rich text, PDFs, images, links, embedded videos, downloadable files) within the units and topics of their assigned subjects.
- Content Publication and Authorization Control: Manages content status (draft/published, visible/hidden), defines publication and optional expiration dates, and authorizes content visibility for specific groups.
- Role-Specific User Interfaces: Provides dedicated user interfaces for Superusers (dashboard, management of users, academic structure, assignments, content, access vigencies, and basic reports), Professors (assigned subjects and groups, content creation and material uploads), and Students (profile, authorized subjects, units, topics, and materials, including expiration notices).
- Access Expiration Enforcement: Implements validation at both the frontend and backend (Supabase) to block content access for users whose accounts have expired, displaying clear messages.

## Style Guidelines:

- Primary color: A rich, deep burgundy (#7B1E3A) to convey professionalism and depth.
- Secondary color: A light, warm beige (#E8D5B7) for backgrounds and subtle elements.
- Accent color: A bright, clear gold (#D4AF37) for interactive elements and highlights, providing a touch of warmth.
- Body and headline font: 'Inter' (sans-serif) for its modern, objective, and highly legible characteristics across all text, ensuring clear communication.
- Minimalist, outline-style icons are used throughout the application to maintain a clean, uncluttered interface and complement the focus-driven design.
- A structured, organized, and responsive layout with ample white space, prioritizing content readability and minimizing visual distraction across all devices and user panels.
- Subtle and smooth animations are used for state changes (e.g., item completion, list updates, navigation transitions) to provide clear visual feedback without being intrusive or distracting.