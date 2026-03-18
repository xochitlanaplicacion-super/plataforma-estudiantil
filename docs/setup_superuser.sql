-- Script Maestro para crear el Superusuario (Versión Robusta)
-- Ejecuta este código completo en el SQL Editor de Supabase

DO $BOOTSTRAP$
DECLARE
  -- Generamos un UUID único
  uid UUID := uuid_generate_v4();
  v_email TEXT := 'ieemilianozapata@gmail.com';
  -- Tu contraseña con $$$ al final
  v_pass TEXT := 'INSTITUTOEDUCATIVOEMILIANOZAPATA$$$';
BEGIN
  -- 1. Insertar en el motor de autenticación
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at, 
    role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    uid, '00000000-0000-0000-0000-000000000000', v_email, 
    extensions.crypt(v_pass, extensions.gen_salt('bf')), 
    now(), 'authenticated', '{"provider":"email","providers":["email"]}',
    jsonb_build_object(
      'nombre', 'ieemilianozapata',
      'apellidos', 'emiliano zapata',
      'curp', 'ZAPA010101HDFRR01',
      'rol', 'superuser'
    ),
    now(), now(), '', '', '', ''
  );

  -- 2. Insertar la identidad (Necesario para que el login funcione)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, 
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    uid, uid, 
    format('{"sub":"%s","email":"%s"}', uid::text, v_email)::jsonb, 
    'email', v_email, now(), now(), now()
  );

  -- El trigger 'on_auth_user_created' se encargará de crear el perfil en 'public.profiles'
END $BOOTSTRAP$;