-- =================================================================================
-- SCRIPT MAESTRO: CREACIÓN DEL SUPERUSUARIO INICIAL
-- Instrucciones: Pega y ejecuta este código en el SQL Editor de Supabase.
-- =================================================================================

DO $_$
DECLARE
  -- Generamos un UUID único para este usuario
  new_user_id UUID := uuid_generate_v4();
  -- Datos de acceso
  v_email TEXT := 'ieemilianozapata@gmail.com';
  -- La contraseña con $$$ no causará error gracias al delimitador $_$
  v_pass TEXT := 'INSTITUTOEDUCATIVOEMILIANOZAPATA$$$';
BEGIN
  -- 1. Insertar en auth.users (Motor de Autenticación)
  INSERT INTO auth.users (
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    role,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    new_user_id,
    '00000000-0000-0000-0000-000000000000',
    v_email,
    extensions.crypt(v_pass, extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object(
      'nombre', 'ieemilianozapata',
      'apellidos', 'emiliano zapata',
      'curp', 'ZAPA010101HDFRR01',
      'rol', 'superuser'
    ),
    now(),
    now(),
    'authenticated',
    '',
    '',
    '',
    ''
  );

  -- 2. Insertar en auth.identities (Vínculo para permitir el login)
  -- Se incluye 'provider_id' que es obligatorio en versiones recientes
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id::text, v_email)::jsonb,
    'email',
    new_user_id::text, -- El provider_id para email suele ser el mismo UUID del usuario
    now(),
    now(),
    now()
  );

  -- El trigger 'on_auth_user_created' se encargará de crear la fila en la tabla profiles automáticamente.
END $_$;