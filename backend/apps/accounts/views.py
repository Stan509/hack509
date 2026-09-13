"""
Accounts views - Authentication and user management endpoints.
"""
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import CustomUser
from .permissions import IsAdmin
from .serializers import (
    CustomTokenObtainPairSerializer,
    UserSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
    UserMeSerializer,
)


class LoginView(TokenObtainPairView):
    """
    POST /api/auth/login/
    Authenticate user and return JWT access+refresh tokens plus user info.
    """
    serializer_class = CustomTokenObtainPairSerializer
    permission_classes = [AllowAny]


class RefreshTokenView(TokenRefreshView):
    """
    POST /api/auth/refresh/
    Refresh JWT access token using refresh token.
    """
    permission_classes = [AllowAny]


class RegisterView(APIView):
    """
    POST /api/auth/register/
    Admin-only: Create a new operator account.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def post(self, request):
        serializer = UserCreateSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            return Response(
                {
                    'message': 'User created successfully.',
                    'user': UserSerializer(user).data,
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MeView(APIView):
    """
    GET /api/auth/me/
    Return the current authenticated user's profile.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserMeSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserMeSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# =============================================================================
# User management (admin only) - mounted at /api/users/
# =============================================================================

class UserListView(generics.ListAPIView):
    """
    GET /api/users/
    Admin only: List all users.
    """
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = UserSerializer
    queryset = CustomUser.objects.all().order_by('-created_at')


class UserDetailView(APIView):
    """
    PATCH /api/users/{id}/ - Update user role/info (admin only)
    DELETE /api/users/{id}/ - Delete user (admin only)
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get_object(self, pk):
        try:
            return CustomUser.objects.get(pk=pk)
        except CustomUser.DoesNotExist:
            return None

    def patch(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        # Prevent admin from demoting themselves
        if user == request.user and request.data.get('role') == 'operator':
            return Response(
                {'error': 'You cannot change your own role.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({'error': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)
        if user == request.user:
            return Response(
                {'error': 'You cannot delete your own account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        username = user.username
        user.delete()
        return Response(
            {'message': f'User "{username}" deleted successfully.'},
            status=status.HTTP_200_OK,
        )


class OperatorListView(generics.ListAPIView):
    """
    GET /api/auth/operators/
    Authenticated users: List all operators/agents for call transfers.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = UserSerializer
    queryset = CustomUser.objects.filter(is_active=True).order_by('username')

