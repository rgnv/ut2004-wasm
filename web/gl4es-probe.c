// Isolated compatibility probe, not an engine-rendering acceptance test.
#include <stdio.h>
#include <string.h>
#include <GL/gl.h>
#include <emscripten.h>
#include <emscripten/html5.h>
extern void initialize_gl4es(void);
extern void *gl4es_GetProcAddress(const char *name);
static const struct { const char *group, *name; } requirements[] = {
#include "gl-requirements.h"
};
int main(void) {
    EmscriptenWebGLContextAttributes attr;
    emscripten_webgl_init_context_attributes(&attr);
    attr.majorVersion = 1;
    attr.preserveDrawingBuffer = 1;
    EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctx = emscripten_webgl_create_context("#canvas", &attr);
    if (ctx <= 0 || emscripten_webgl_make_context_current(ctx) != EMSCRIPTEN_RESULT_SUCCESS) {
        puts("GL4ES probe: WebGL context failed");
        return 1;
    }
    initialize_gl4es();
    printf("GL4ES probe: GL_VERSION=%s\n", glGetString(GL_VERSION));
    int missing = 0, base = 0, count = sizeof(requirements) / sizeof(requirements[0]);
    for (int i = 0; i < count; i++) {
        int mandatory = !strcmp(requirements[i].group, "_GL");
        base += mandatory;
        if (!gl4es_GetProcAddress(requirements[i].name)) {
            printf("GL4ES probe: missing %s %s\n", requirements[i].group, requirements[i].name);
            missing += mandatory;
        }
    }
    printf("GL4ES probe: requested=%d base=%d missing_base=%d\n", count, base, missing);
    glViewport(0, 0, 640, 480);
    glClearColor(0, 0, 0, 1);
    glClear(GL_COLOR_BUFFER_BIT);
    glBegin(GL_TRIANGLES);
    glColor3f(1, 0, 0); glVertex2f(-0.8f, -0.8f);
    glColor3f(0, 1, 0); glVertex2f(0.8f, -0.8f);
    glColor3f(0, 0, 1); glVertex2f(0, 0.8f);
    glEnd();
    glFinish();
    unsigned char pixel[4] = {0};
    glReadPixels(320, 240, 1, 1, GL_RGBA, GL_UNSIGNED_BYTE, pixel);
    GLenum error = glGetError();
    printf("GL4ES probe: pixel(320,240)=[%u,%u,%u,%u] glGetError=0x%x\n", pixel[0], pixel[1], pixel[2], pixel[3], error);
    EM_ASM({Object.assign(window, {glProbe: {pixel: [$0,$1,$2,$3], error: $4, missingBase: $5}});}, pixel[0], pixel[1], pixel[2], pixel[3], error, missing);
    return missing || error || !(pixel[0] || pixel[1] || pixel[2]);
}
