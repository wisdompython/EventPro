from django.conf import settings
from rest_framework.throttling import AnonRateThrottle


class AuthRateThrottle(AnonRateThrottle):
    def get_cache_key(self, request, view):
        if settings.TESTING:
            return None
        return super().get_cache_key(request, view)


class LoginRateThrottle(AuthRateThrottle):
    scope = 'login'
    rate = '10/min'


class SignupRateThrottle(AuthRateThrottle):
    scope = 'signup'
    rate = '5/hour'
