/**
 * Cetisgram - Main JavaScript
 * Funcionalidades principales para el foro
 */

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', function() {
    // Inicializar tooltips y popovers de Bootstrap
    const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
    const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => new bootstrap.Tooltip(tooltipTriggerEl));
    
    const popoverTriggerList = document.querySelectorAll('[data-bs-toggle="popover"]');
    const popoverList = [...popoverTriggerList].map(popoverTriggerEl => new bootstrap.Popover(popoverTriggerEl));

    // Navbar Toggler Fix: Ensure mobile menu toggles correctly
    const navbarToggler = document.querySelector('.navbar-toggler');
    const navbarCollapseTarget = document.getElementById('navbarNav');

    if (navbarToggler && navbarCollapseTarget) {
        navbarToggler.addEventListener('click', function() {
            try {
                const collapseInstance = bootstrap.Collapse.getOrCreateInstance(navbarCollapseTarget);
                if (collapseInstance) {
                    collapseInstance.toggle();
                }
            } catch (e) {
                // Log actual errors during toggle, but not for general debugging.
                console.error('Error toggling navbar:', e);
            }
        });
    }
    // END Navbar Toggler Fix

    // Like button functionality
    document.querySelectorAll('.like-btn').forEach(button => {
        button.addEventListener('click', async function() {
            if (!this.dataset.postId) return;

            const postId = this.dataset.postId;
            console.log('Like button clicked for postId:', postId);
            const icon = this.querySelector('i');
            console.log('Icon element:', icon);
            const likesCountSpan = this.querySelector('.likes-count');
            console.log('Likes count span:', likesCountSpan);

            // Optimistic UI update for icon (optional, can make UI feel faster)
            // const currentlyLiked = icon.classList.contains('fas');
            // if (currentlyLiked) {
            //     icon.classList.remove('fas'); icon.classList.add('far');
            //     this.classList.remove('btn-danger'); this.classList.add('btn-outline-danger');
            // } else {
            //     icon.classList.remove('far'); icon.classList.add('fas');
            //     this.classList.remove('btn-outline-danger'); this.classList.add('btn-danger');
            // }

            try {
                const response = await fetch(`/posts/${postId}/like`, {
                    method: 'POST',
                    headers: {
                        'Accept': 'application/json',
                        'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').getAttribute('content')
                    }
                });

                if (!response.ok) {
                    if (response.status === 401) {
                        alert('Debes iniciar sesión para dar me gusta.');
                        // Consider redirecting or showing a login modal
                        // window.location.href = '/auth/login'; 
                    } else {
                        // Revert optimistic UI update if there was one
                        // console.error('Server error:', response.statusText);
                        alert('Error al procesar la solicitud de me gusta.');
                    }
                    return;
                }

                const data = await response.json();
                console.log('Data from server:', data);

                if (data.success) {
                    console.log('Like/Unlike successful, updating UI.');
                    likesCountSpan.textContent = data.likesCount;
                    if (data.isLiked) {
                        icon.classList.remove('far');
                        icon.classList.add('fas');
                        this.classList.remove('btn-outline-danger');
                        this.classList.add('btn-danger');
                    } else {
                        icon.classList.remove('fas');
                        icon.classList.add('far');
                        this.classList.remove('btn-danger');
                        this.classList.add('btn-outline-danger');
                    }
                } else {
                    // Revert optimistic UI update if there was one
                    alert(data.message || 'No se pudo actualizar el "me gusta".');
                }
            } catch (error) {
                // Revert optimistic UI update if there was one
                console.error('Error en la función de like:', error);
                alert('Ocurrió un error de red al intentar dar me gusta.');
            }
        });
    });
    
    // Validación de contraseñas en el formulario de registro
    const registerForm = document.querySelector('form[action="/auth/register"]');
    if (registerForm) {
        const password = registerForm.querySelector('#password');
        const confirmPassword = registerForm.querySelector('#confirmPassword');
        
        registerForm.addEventListener('submit', function(e) {
            if (password.value !== confirmPassword.value) {
                e.preventDefault();
                
                // Crear mensaje de error si no existe
                let errorElement = document.getElementById('password-mismatch-error');
                if (!errorElement) {
                    errorElement = document.createElement('div');
                    errorElement.id = 'password-mismatch-error';
                    errorElement.className = 'alert alert-danger mt-3';
                    errorElement.textContent = 'Las contraseñas no coinciden.';
                    confirmPassword.parentNode.appendChild(errorElement);
                }
                
                // Resaltar los campos con error
                password.classList.add('is-invalid');
                confirmPassword.classList.add('is-invalid');
                
                // Enfocar el campo para corregir
                confirmPassword.focus();
            }
        });
        
        // Limpiar errores cuando el usuario comienza a corregir
        [password, confirmPassword].forEach(input => {
            input.addEventListener('input', function() {
                this.classList.remove('is-invalid');
                const errorElement = document.getElementById('password-mismatch-error');
                if (errorElement) {
                    errorElement.remove();
                }
            });
        });
    }
    
    // Mostrar vista previa de imágenes antes de subirlas
    const imageInput = document.querySelector('input[type="file"][name="image"]');
    if (imageInput) {
        const previewContainer = document.createElement('div');
        previewContainer.className = 'mt-3 text-center d-none';
        previewContainer.id = 'image-preview';
        
        const previewImage = document.createElement('img');
        previewImage.className = 'img-thumbnail';
        previewImage.style.maxHeight = '200px';
        
        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'btn btn-sm btn-outline-danger mt-2';
        removeButton.innerHTML = '<i class="fas fa-times"></i> Quitar imagen';
        removeButton.onclick = function() {
            imageInput.value = '';
            previewContainer.classList.add('d-none');
        };
        
        previewContainer.appendChild(previewImage);
        previewContainer.appendChild(document.createElement('br'));
        previewContainer.appendChild(removeButton);
        
        imageInput.parentNode.insertBefore(previewContainer, imageInput.nextSibling);
        
        imageInput.addEventListener('change', function() {
            if (this.files && this.files[0]) {
                const reader = new FileReader();
                
                reader.onload = function(e) {
                    previewImage.src = e.target.result;
                    previewContainer.classList.remove('d-none');
                };
                
                reader.readAsDataURL(this.files[0]);
            } else {
                previewContainer.classList.add('d-none');
            }
        });
    }
    
    // Funcionalidad para confirmar eliminación de posts
    const deletePostBtn = document.getElementById('deletePostBtn');
    if (deletePostBtn) {
        deletePostBtn.addEventListener('click', function(e) {
            e.preventDefault();
            
            if (confirm('¿Estás seguro de que quieres eliminar este post? Esta acción no se puede deshacer.')) {
                const postId = this.getAttribute('data-post-id');
                
                // Crear y enviar formulario para eliminar
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = `/posts/${postId}/delete`;
                form.style.display = 'none';
                
                document.body.appendChild(form);
                form.submit();
            }
        });
    }
    
    // Editar comentarios inline
    document.querySelectorAll('.edit-comment-btn').forEach(button => {
        button.addEventListener('click', function() {
            const commentId = this.getAttribute('data-comment-id');
            const commentElement = document.getElementById(`comment-${commentId}`);
            const commentContent = commentElement.querySelector('.comment-content');
            const originalText = commentContent.textContent.trim();
            
            // Crear formulario de edición
            const textarea = document.createElement('textarea');
            textarea.className = 'form-control mb-2';
            textarea.value = originalText;
            textarea.rows = 3;
            
            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'btn btn-sm btn-primary me-2';
            saveButton.textContent = 'Guardar';
            
            const cancelButton = document.createElement('button');
            cancelButton.type = 'button';
            cancelButton.className = 'btn btn-sm btn-outline-secondary';
            cancelButton.textContent = 'Cancelar';
            
            // Reemplazar contenido con el formulario
            const originalHtml = commentContent.innerHTML;
            commentContent.innerHTML = '';
            commentContent.appendChild(textarea);
            commentContent.appendChild(document.createElement('div')).appendChild(saveButton);
            commentContent.lastChild.appendChild(cancelButton);
            
            // Handler para guardar cambios
            saveButton.addEventListener('click', async function() {
                try {
                    const response = await fetch(`/comments/${commentId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ content: textarea.value })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        commentContent.innerHTML = textarea.value;
                    } else {
                        alert('Error: ' + data.message);
                        commentContent.innerHTML = originalHtml;
                    }
                } catch (error) {
                    console.error('Error:', error);
                    alert('Hubo un error al editar el comentario');
                    commentContent.innerHTML = originalHtml;
                }
            });
            
            // Handler para cancelar
            cancelButton.addEventListener('click', function() {
                commentContent.innerHTML = originalHtml;
            });
            
            textarea.focus();
        });
    });
    
    // Efecto de animación para elementos nuevos
    document.querySelectorAll('.fade-in-element').forEach(element => {
        element.classList.add('fade-in');
    });
    
    // Actualizar contador de caracteres en formularios
    document.querySelectorAll('textarea[data-max-length]').forEach(textarea => {
        const maxLength = parseInt(textarea.getAttribute('data-max-length'));
        const counterId = textarea.getAttribute('data-counter');
        const counter = document.getElementById(counterId);
        
        if (counter) {
            textarea.addEventListener('input', function() {
                const remaining = maxLength - this.value.length;
                counter.textContent = remaining;
                
                if (remaining < 0) {
                    counter.classList.add('text-danger');
                    counter.classList.remove('text-muted');
                } else {
                    counter.classList.remove('text-danger');
                    counter.classList.add('text-muted');
                }
            });
            
            // Disparar el evento para inicializar el contador
            textarea.dispatchEvent(new Event('input'));
        }
    });
});
