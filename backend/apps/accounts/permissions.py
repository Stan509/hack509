"""
Custom permissions for HACKER509.
"""
from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """
    Allows access only to users with role='admin'.
    """
    message = 'Only administrators can perform this action.'

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'admin'
        )


class IsAdminOrReadOnly(BasePermission):
    """
    Allows read access to any authenticated user.
    Write access only to admins.
    """
    message = 'Only administrators can modify this resource.'

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return True
        return request.user.role == 'admin'


class IsOperatorOrAdmin(BasePermission):
    """
    Allows access to authenticated operators and admins.
    """
    message = 'Authentication required.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)
