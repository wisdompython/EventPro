from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    OrganizationViewSet,
    UserViewSet,
    csrf_view,
    login_view,
    signup_view,
    logout_view,
    me_view,
    password_change_view,
    password_reset_confirm_view,
    password_reset_request_view,
)

router = DefaultRouter()
router.register('users', UserViewSet, basename='user')
router.register('organizations', OrganizationViewSet, basename='organization')

urlpatterns = [
    path('csrf/',   csrf_view),
    path('login/',  login_view),
    path('signup/', signup_view),
    path('logout/', logout_view),
    path('me/',     me_view),
    path('password/change/', password_change_view),
    path('password/reset/', password_reset_request_view),
    path('password/reset/confirm/', password_reset_confirm_view),
    path('', include(router.urls)),
]
