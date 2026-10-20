import os
import secrets
from pathlib import Path
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get('TALENTO_DATA_DIR', BASE_DIR / 'var'))
DATA_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
PRODUCTION = os.environ.get('TALENTO_PRODUCTION') == '1'
if PRODUCTION and not os.environ.get('DJANGO_SECRET_KEY'):
    raise RuntimeError('Defina DJANGO_SECRET_KEY para producción.')
# Exclusively local bootstrap secret, created with restrictive permissions.
secret_file = DATA_DIR / '.secret'
if not os.environ.get('DJANGO_SECRET_KEY') and not secret_file.exists():
    try:
        with open(secret_file, 'x', opener=lambda p, flags: os.open(p, flags, 0o600)) as f:
            f.write(secrets.token_urlsafe(64))
    except FileExistsError:
        pass
SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY') or secret_file.read_text()
DEBUG = not PRODUCTION
if PRODUCTION and not os.environ.get('DJANGO_ALLOWED_HOSTS'):
    raise RuntimeError('Defina DJANGO_ALLOWED_HOSTS para producción.')
ALLOWED_HOSTS = os.environ.get('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,[::1],testserver').split(',')
INSTALLED_APPS = ['django.contrib.auth', 'django.contrib.contenttypes', 'django.contrib.sessions', 'django.contrib.messages', 'django.contrib.staticfiles', 'core']
MIDDLEWARE = ['django.middleware.security.SecurityMiddleware', 'django.contrib.sessions.middleware.SessionMiddleware', 'django.middleware.common.CommonMiddleware', 'django.middleware.csrf.CsrfViewMiddleware', 'django.contrib.auth.middleware.AuthenticationMiddleware', 'django.contrib.messages.middleware.MessageMiddleware', 'django.middleware.clickjacking.XFrameOptionsMiddleware', 'core.middleware.PrivateResponseMiddleware']
ROOT_URLCONF = 'talento.urls'
TEMPLATES = [{'BACKEND': 'django.template.backends.django.DjangoTemplates', 'DIRS': [], 'APP_DIRS': True, 'OPTIONS': {'context_processors': ['django.template.context_processors.request', 'django.contrib.auth.context_processors.auth', 'django.contrib.messages.context_processors.messages', 'core.context.navigation']}}]
WSGI_APPLICATION = 'talento.wsgi.application'
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': DATA_DIR / 'talento.sqlite3', 'OPTIONS': {'timeout': 20, 'transaction_mode': 'IMMEDIATE'}}}
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_PASSWORD_VALIDATORS = [{'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'}, {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 12}}, {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'}, {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'}]
PASSWORD_HASHERS = ['django.contrib.auth.hashers.ScryptPasswordHasher', 'django.contrib.auth.hashers.PBKDF2PasswordHasher']
LANGUAGE_CODE = 'es-co'
TIME_ZONE = 'America/Bogota'
USE_TZ = True
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
LOGIN_URL = '/ingresar/'
LOGIN_REDIRECT_URL = '/'
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Strict'
CSRF_COOKIE_SAMESITE = 'Strict'
SESSION_COOKIE_AGE = 3600
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_SECURE = PRODUCTION
CSRF_COOKIE_SECURE = PRODUCTION
SECURE_SSL_REDIRECT = PRODUCTION
SECURE_HSTS_SECONDS = 31536000 if PRODUCTION else 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = PRODUCTION
SECURE_HSTS_PRELOAD = PRODUCTION
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'same-origin'
X_FRAME_OPTIONS = 'DENY'
DATA_UPLOAD_MAX_MEMORY_SIZE = 12 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
