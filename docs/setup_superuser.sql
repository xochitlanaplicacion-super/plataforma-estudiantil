-- Código Maestro SQL para crear el primer Superusuario
-- Instrucciones: Pega y ejecuta esto en el SQL Editor de Supabase
-- Se ha cambiado el delimitador del bloque DO a $creator$ para evitar conflictos con el símbolo '$' en la contraseña.

DO $creator$
DECLARE
  -- Generamos un UUID único para este usuario
  new_user_id UUID := uuid_generate_v4();
  -- Datos del usuario
  v_email TEXT := 'ieemilianozapata@gmail.com';
  -- La contraseña contiene símbolos '$' que antes causaban conflicto con el delimitador '$$'
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
      'curp', 'ZAPA010101HDFRR01', -- CURP inventada
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
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    new_user_id,
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id::text, v_email)::jsonb,
    'email',
    now(),
    now(),
    now()
  );

  -- El trigger 'on_auth_user_created' se encargará de crear el registro en 'public.profiles' automáticamente.
END $creator$;